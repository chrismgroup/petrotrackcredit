import { randomUUID } from "crypto";
import { and, desc, eq, gte, inArray, isNull, lte, or, gt, sql, type SQL } from "drizzle-orm";
import express, { Router, type IRouter, type Request, type Response } from "express";

import {
  appStateTable,
  db,
  paymentLedgerEntriesTable,
  paymentProviderEventsTable,
  paymentTerminalsTable,
  paymentTransactionsTable,
  terminalShiftAssignmentsTable,
} from "@workspace/db";
import {
  PAYMENT_METHODS,
  SANDBOX_SIGNATURE_HEADER,
  SANDBOX_SIGNATURE_VERSION,
  SANDBOX_TIMESTAMP_HEADER,
  MAX_TRANSACTION_KOBO,
  isPaymentProvider,
  ledgerLinesFor,
  parseSandboxEvent,
  sandboxSecret,
  sha256Hex,
  signSandboxPayload,
  verifySandboxSignature,
  type NormalizedPaymentEvent,
  type PaymentMethod,
  type PaymentProvider,
} from "./payments-webhook";

type Auth = NonNullable<Request["auth"]>;

const VIEW_ALL_ROLES = new Set(["admin", "ceo", "md", "acc", "csm"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9_.:|-]{1,64}$/;

function canView(auth: Auth): boolean {
  return VIEW_ALL_ROLES.has(auth.role) || (auth.role === "mgr" && !!auth.branchId);
}

/** Branch the caller is limited to, or null when they can see every branch. */
function scopedBranch(auth: Auth): string | null {
  return VIEW_ALL_ROLES.has(auth.role) ? null : auth.branchId ?? null;
}

function pgError(err: unknown): { code?: string; constraint?: string } {
  const e = err as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return { code: e?.code ?? e?.cause?.code, constraint: e?.constraint ?? e?.cause?.constraint };
}

type IngestResult =
  | { status: 200; body: { recorded: true; transactionId: string } }
  | { status: 200; body: { replayed: true } }
  | { status: 422; body: { error: string } };

/**
 * Records one verified provider event. Event and transaction IDs are unique,
 * so provider retries and concurrent deliveries are idempotent.
 */
export async function ingestPaymentEvent(
  provider: PaymentProvider,
  event: NormalizedPaymentEvent,
  payloadSha256: string,
  signatureVersion: string,
): Promise<IngestResult> {
  const [terminal] = await db.select().from(paymentTerminalsTable).where(and(
    eq(paymentTerminalsTable.provider, provider),
    eq(paymentTerminalsTable.providerTerminalId, event.providerTerminalId),
  ));
  // Unknown terminals are rejected without recording so the provider retries
  // after the terminal is registered, rather than guessing a branch.
  if (!terminal) return { status: 422, body: { error: "Unknown terminal" } };

  return db.transaction(async tx => {
    const [eventRow] = await tx.insert(paymentProviderEventsTable).values({
      provider,
      providerEventId: event.providerEventId,
      eventType: event.eventType,
      payloadSha256,
      occurredAt: event.occurredAt,
      signatureVersion,
    }).onConflictDoNothing().returning({ id: paymentProviderEventsTable.id });
    if (!eventRow) return { status: 200, body: { replayed: true } } as const;

    const [shift] = await tx.select({ id: terminalShiftAssignmentsTable.id })
      .from(terminalShiftAssignmentsTable)
      .where(and(
        eq(terminalShiftAssignmentsTable.terminalId, terminal.id),
        lte(terminalShiftAssignmentsTable.openedAt, event.occurredAt),
        or(isNull(terminalShiftAssignmentsTable.closedAt), gt(terminalShiftAssignmentsTable.closedAt, event.occurredAt)),
      ))
      .limit(1);

    const metadata: Record<string, string> = { ...event.metadata };
    if (terminal.status !== "active") metadata.terminalStatus = terminal.status;

    const [txRow] = await tx.insert(paymentTransactionsTable).values({
      provider,
      providerTransactionId: event.providerTransactionId,
      providerEventId: event.providerEventId,
      providerEventRecordId: eventRow.id,
      terminalId: terminal.id,
      shiftAssignmentId: shift?.id ?? null,
      branchId: terminal.branchId,
      pumpId: terminal.pumpId,
      method: event.method,
      status: event.status,
      amountKobo: event.amountKobo,
      currency: event.currency,
      occurredAt: event.occurredAt,
      reversalOfProviderTransactionId: event.reversalOfProviderTransactionId,
      metadata,
    }).onConflictDoNothing().returning({ id: paymentTransactionsTable.id });
    if (!txRow) return { status: 200, body: { replayed: true } } as const;

    const lines = ledgerLinesFor(event);
    if (lines.length) {
      await tx.insert(paymentLedgerEntriesTable).values(lines.map(line => ({ ...line, transactionId: txRow.id })));
    }
    return { status: 200, body: { recorded: true, transactionId: txRow.id } } as const;
  });
}

/* ───────────────────────── Webhook (unauthenticated, signed) ───────────────────────── */

export const paymentsWebhookRouter: IRouter = Router();

paymentsWebhookRouter.post(
  "/:provider",
  express.raw({ type: () => true, limit: "64kb" }),
  async (req: Request, res: Response) => {
    const provider = String(req.params.provider);
    if (!isPaymentProvider(provider)) {
      res.status(404).json({ error: "Unknown provider" });
      return;
    }
    if (provider === "moniepoint") {
      // Enabled only after Moniepoint's POS webhook schema and signature are confirmed.
      res.status(503).json({ error: "Provider not configured" });
      return;
    }
    const secret = sandboxSecret();
    if (!secret) {
      res.status(503).json({ error: "Provider not configured" });
      return;
    }
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    const verified = verifySandboxSignature(
      secret,
      raw,
      req.header(SANDBOX_TIMESTAMP_HEADER),
      req.header(SANDBOX_SIGNATURE_HEADER),
    );
    if (!verified.ok) {
      req.log.warn({ provider, reason: verified.error }, "Rejected payment webhook");
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    const parsed = parseSandboxEvent(raw);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }
    try {
      const result = await ingestPaymentEvent(provider, parsed.event, sha256Hex(raw), SANDBOX_SIGNATURE_VERSION);
      if (result.status === 422) req.log.warn({ provider, terminal: parsed.event.providerTerminalId }, "Payment webhook for unknown terminal");
      res.status(result.status).json(result.body);
    } catch (err) {
      req.log.error({ err }, "Payment webhook ingest failed");
      res.status(500).json({ error: "Could not record event" });
    }
  },
);

/* ───────────────────────── Authenticated API ───────────────────────── */

const router: IRouter = Router();

async function loadBranchesAndPumps(): Promise<{
  branches: Array<{ id: string; name: string }>;
  pumps: Array<{ id: string; name: string; branchId?: string }>;
}> {
  const rows = await db.select().from(appStateTable).where(inArray(appStateTable.key, ["branches", "pumps"]));
  const read = (key: string) => {
    const data = rows.find(row => row.key === key)?.data;
    return Array.isArray(data) ? data.filter(item => item && typeof item === "object") as Array<Record<string, unknown>> : [];
  };
  return {
    branches: read("branches").map(b => ({ id: String(b.id ?? ""), name: String(b.name ?? b.id ?? "") })),
    pumps: read("pumps").map(p => ({
      id: String(p.id ?? ""),
      name: String(p.name ?? p.id ?? ""),
      branchId: typeof p.branchId === "string" ? p.branchId : undefined,
    })),
  };
}

router.get("/payments/config", (req, res) => {
  if (!canView(req.auth!)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json({
    providers: [
      { id: "sandbox", label: "Petrotrack sandbox", ready: !!sandboxSecret() },
      { id: "moniepoint", label: "Moniepoint POS", ready: false },
    ],
  });
});

router.get("/payments/terminals", async (req, res) => {
  const auth = req.auth!;
  if (!canView(auth)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const branch = scopedBranch(auth);
  const rows = await db.select().from(paymentTerminalsTable)
    .where(branch ? eq(paymentTerminalsTable.branchId, branch) : undefined)
    .orderBy(desc(paymentTerminalsTable.createdAt));
  res.json({ terminals: rows });
});

router.post("/payments/terminals", async (req, res) => {
  if (req.auth!.role !== "admin") {
    res.status(403).json({ error: "Only an administrator can register POS terminals" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const provider = String(body.provider ?? "");
  const providerTerminalId = String(body.providerTerminalId ?? "").trim();
  const branchId = String(body.branchId ?? "").trim();
  const pumpId = String(body.pumpId ?? "").trim();
  const label = String(body.label ?? "").trim();
  if (!isPaymentProvider(provider)) {
    res.status(400).json({ error: "Choose a supported provider" });
    return;
  }
  if (!TERMINAL_ID_PATTERN.test(providerTerminalId)) {
    res.status(400).json({ error: "Enter the terminal ID printed on the POS (letters, numbers, - _ . : |)" });
    return;
  }
  if (!label || label.length > 80) {
    res.status(400).json({ error: "Enter a label of up to 80 characters" });
    return;
  }
  const { branches, pumps } = await loadBranchesAndPumps();
  if (!branches.some(branch => branch.id === branchId)) {
    res.status(400).json({ error: "Choose an existing branch" });
    return;
  }
  if (!pumps.some(pump => pump.id === pumpId && pump.branchId === branchId)) {
    res.status(400).json({ error: "Choose a pump that belongs to this branch" });
    return;
  }
  try {
    const [terminal] = await db.insert(paymentTerminalsTable)
      .values({ provider, providerTerminalId, branchId, pumpId, label })
      .returning();
    res.status(201).json({ terminal });
  } catch (err) {
    const { code, constraint } = pgError(err);
    if (code === "23505") {
      res.status(409).json({
        error: constraint === "payment_terminals_active_pump_unique"
          ? "This pump already has an active terminal. Disable it first."
          : "This terminal ID is already registered.",
      });
      return;
    }
    req.log.error({ err }, "Terminal registration failed");
    res.status(500).json({ error: "Could not register terminal" });
  }
});

router.post("/payments/terminals/:id/disable", async (req, res) => {
  if (req.auth!.role !== "admin") {
    res.status(403).json({ error: "Only an administrator can disable POS terminals" });
    return;
  }
  const id = String(req.params.id);
  if (!UUID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid terminal ID" });
    return;
  }
  const [terminal] = await db.update(paymentTerminalsTable)
    .set({ status: "disabled", disabledAt: new Date() })
    .where(and(eq(paymentTerminalsTable.id, id), eq(paymentTerminalsTable.status, "active")))
    .returning();
  if (!terminal) {
    res.status(404).json({ error: "Active terminal not found" });
    return;
  }
  res.json({ terminal });
});

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

router.get("/payments/transactions", async (req, res) => {
  const auth = req.auth!;
  if (!canView(auth)) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const q = req.query as Record<string, unknown>;
  const scoped = scopedBranch(auth);
  const branchId = scoped ?? (typeof q.branchId === "string" && q.branchId ? q.branchId : null);
  const filters: SQL[] = [];
  if (branchId) filters.push(eq(paymentTransactionsTable.branchId, branchId));
  if (typeof q.pumpId === "string" && q.pumpId) filters.push(eq(paymentTransactionsTable.pumpId, q.pumpId));
  if (typeof q.terminalId === "string" && UUID_PATTERN.test(q.terminalId)) {
    filters.push(eq(paymentTransactionsTable.terminalId, q.terminalId));
  }
  if (typeof q.method === "string" && (PAYMENT_METHODS as readonly string[]).includes(q.method)) {
    filters.push(eq(paymentTransactionsTable.method, q.method));
  }
  const from = parseDate(q.from);
  const to = parseDate(q.to);
  if (from) filters.push(gte(paymentTransactionsTable.occurredAt, from));
  if (to) filters.push(lte(paymentTransactionsTable.occurredAt, to));
  const where = filters.length ? and(...filters) : undefined;
  const limit = Math.min(Math.max(Number(q.limit) || 100, 1), 500);

  const t = paymentTransactionsTable;
  const sumWhere = (condition: SQL) => sql<string>`coalesce(sum(${t.amountKobo}) filter (where ${condition}), 0)::text`;
  const [rows, [totals]] = await Promise.all([
    db.select({
      id: t.id,
      provider: t.provider,
      providerTransactionId: t.providerTransactionId,
      terminalId: t.terminalId,
      terminalLabel: paymentTerminalsTable.label,
      providerTerminalId: paymentTerminalsTable.providerTerminalId,
      branchId: t.branchId,
      pumpId: t.pumpId,
      method: t.method,
      status: t.status,
      amountKobo: t.amountKobo,
      occurredAt: t.occurredAt,
      recordedAt: t.recordedAt,
      reversalOfProviderTransactionId: t.reversalOfProviderTransactionId,
      metadata: t.metadata,
    })
      .from(t)
      .leftJoin(paymentTerminalsTable, eq(paymentTerminalsTable.id, t.terminalId))
      .where(where)
      .orderBy(desc(t.occurredAt))
      .limit(limit),
    db.select({
      count: sql<string>`count(*)::text`,
      cardKobo: sumWhere(sql`${t.method} = 'card' and ${t.status} = 'successful'`),
      transferKobo: sumWhere(sql`${t.method} = 'transfer' and ${t.status} = 'successful'`),
      reversalKobo: sumWhere(sql`${t.status} = 'reversal'`),
      failedCount: sql<string>`count(*) filter (where ${t.status} = 'failed')::text`,
    }).from(t).where(where),
  ]);
  const cardKobo = Number(totals.cardKobo);
  const transferKobo = Number(totals.transferKobo);
  const reversalKobo = Number(totals.reversalKobo);
  res.json({
    transactions: rows,
    totals: {
      count: Number(totals.count),
      cardKobo,
      transferKobo,
      reversalKobo,
      failedCount: Number(totals.failedCount),
      netKobo: cardKobo + transferKobo - reversalKobo,
    },
  });
});

/** Admin-only demo helper: signs a sample event and sends it through the real webhook pipeline. */
router.post("/payments/sandbox/simulate", async (req, res) => {
  if (req.auth!.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const secret = sandboxSecret();
  if (!secret) {
    res.status(503).json({ error: "Sandbox payments are not enabled on this server" });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const terminalId = String(body.terminalId ?? "");
  const method = String(body.method ?? "card") as PaymentMethod;
  const amountKobo = Number(body.amountKobo);
  if (!UUID_PATTERN.test(terminalId)) {
    res.status(400).json({ error: "Choose a terminal" });
    return;
  }
  if (!(PAYMENT_METHODS as readonly string[]).includes(method)) {
    res.status(400).json({ error: "Choose card or transfer" });
    return;
  }
  if (!Number.isSafeInteger(amountKobo) || amountKobo <= 0 || amountKobo > MAX_TRANSACTION_KOBO) {
    res.status(400).json({ error: "Enter a valid amount" });
    return;
  }
  const [terminal] = await db.select().from(paymentTerminalsTable).where(and(
    eq(paymentTerminalsTable.id, terminalId),
    eq(paymentTerminalsTable.provider, "sandbox"),
  ));
  if (!terminal) {
    res.status(404).json({ error: "Sandbox terminal not found" });
    return;
  }
  const raw = Buffer.from(JSON.stringify({
    eventId: `evt_${randomUUID()}`,
    eventType: "pos.transaction",
    occurredAt: new Date().toISOString(),
    transaction: {
      id: `txn_${randomUUID()}`,
      terminalId: terminal.providerTerminalId,
      method,
      status: "successful",
      amountKobo,
      currency: "NGN",
      reference: "SANDBOX",
    },
  }));
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = signSandboxPayload(secret, timestamp, raw);
  const verified = verifySandboxSignature(secret, raw, timestamp, signature);
  const parsed = parseSandboxEvent(raw);
  if (!verified.ok || !parsed.ok) {
    res.status(500).json({ error: "Could not build sandbox event" });
    return;
  }
  const result = await ingestPaymentEvent("sandbox", parsed.event, sha256Hex(raw), SANDBOX_SIGNATURE_VERSION);
  res.status(result.status).json(result.body);
});

export default router;
