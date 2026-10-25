import { createHash, createHmac, timingSafeEqual } from "crypto";

/**
 * Provider-agnostic POS webhook rules. Every provider adapter must turn its
 * signed payload into a NormalizedPaymentEvent; nothing downstream trusts the
 * raw request. Only the Petrotrack sandbox adapter is implemented until the
 * Moniepoint POS webhook schema and signature scheme are confirmed in writing.
 */

export const PAYMENT_PROVIDERS = ["sandbox", "moniepoint"] as const;
export type PaymentProvider = typeof PAYMENT_PROVIDERS[number];

export const PAYMENT_METHODS = ["card", "transfer"] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];

export const PAYMENT_STATUSES = ["successful", "failed", "reversal"] as const;
export type PaymentStatus = typeof PAYMENT_STATUSES[number];

export const SANDBOX_SIGNATURE_HEADER = "x-petrotrack-signature";
export const SANDBOX_TIMESTAMP_HEADER = "x-petrotrack-timestamp";
export const SANDBOX_SIGNATURE_VERSION = "petrotrack-hmac-sha256-v1";
export const MONIEPOINT_SIGNATURE_VERSION = "moniepoint-hmac-sha256-v1";
export const MONIEPOINT_WEBHOOK_ID_HEADER = "moniepoint-webhook-id";
export const MONIEPOINT_WEBHOOK_TIMESTAMP_HEADER = "moniepoint-webhook-timestamp";
export const MONIEPOINT_WEBHOOK_SIGNATURE_HEADER = "moniepoint-webhook-signature";
export const MAX_TIMESTAMP_SKEW_SECONDS = 300;
export const MAX_TRANSACTION_KOBO = 100_000_000_000; // ₦1bn per POS transaction

export interface NormalizedPaymentEvent {
  providerEventId: string;
  eventType: string;
  occurredAt: Date;
  providerTransactionId: string;
  providerTerminalId: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountKobo: number;
  currency: "NGN";
  reversalOfProviderTransactionId: string | null;
  metadata: Record<string, string>;
}

export type ParseResult =
  | { ok: true; event: NormalizedPaymentEvent }
  | { ok: false; error: string };

export interface LedgerLine {
  account: string;
  direction: "debit" | "credit";
  amountKobo: number;
}

const ID_PATTERN = /^[A-Za-z0-9_.:|-]{1,128}$/;
const METADATA_KEYS = ["reference", "rrn", "stan", "cardScheme", "narration", "senderBank"] as const;

export function isPaymentProvider(value: string): value is PaymentProvider {
  return (PAYMENT_PROVIDERS as readonly string[]).includes(value);
}

export function sha256Hex(raw: Buffer): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function signSandboxPayload(secret: string, timestamp: string, raw: Buffer): string {
  const mac = createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex");
  return `v1=${mac}`;
}

export function verifySandboxSignature(
  secret: string,
  raw: Buffer,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; error: string } {
  if (!timestampHeader || !signatureHeader) return { ok: false, error: "Missing signature headers" };
  if (!/^\d{10}$/.test(timestampHeader)) return { ok: false, error: "Invalid timestamp" };
  const skew = Math.abs(nowMs / 1000 - Number(timestampHeader));
  if (skew > MAX_TIMESTAMP_SKEW_SECONDS) return { ok: false, error: "Timestamp outside the allowed window" };
  const expected = Buffer.from(signSandboxPayload(secret, timestampHeader, raw));
  const received = Buffer.from(signatureHeader.trim());
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, error: "Invalid signature" };
  }
  return { ok: true };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function idField(value: unknown): string | null {
  return typeof value === "string" && ID_PATTERN.test(value) ? value : null;
}

/**
 * Moniepoint signs the literal received body with:
 *   HMAC-SHA256(secret, webhookId + "__" + timestampMs + "__" + rawBody)
 * and encodes the digest as base64. Keep this handler on the raw request body.
 */
export function moniepointSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.MONIEPOINT_WEBHOOK_SECRET?.trim() ?? "";
  return secret.length ? secret : null;
}

export function verifyMoniepointSignature(
  secret: string,
  raw: Buffer,
  webhookId: string | undefined,
  timestampHeader: string | undefined,
  signatureHeader: string | undefined,
  nowMs: number = Date.now(),
): { ok: true } | { ok: false; error: string } {
  if (!webhookId || !idField(webhookId) || !timestampHeader || !/^\d{13}$/.test(timestampHeader) || !signatureHeader) {
    return { ok: false, error: "Missing or invalid Moniepoint signature headers" };
  }
  if (Math.abs(nowMs - Number(timestampHeader)) > MAX_TIMESTAMP_SKEW_SECONDS * 1000) {
    return { ok: false, error: "Timestamp outside the allowed window" };
  }
  const signed = `${webhookId}__${timestampHeader}__${raw.toString("utf8")}`;
  const expected = Buffer.from(createHmac("sha256", secret).update(signed).digest("base64"));
  const received = Buffer.from(signatureHeader.trim());
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, error: "Invalid Moniepoint signature" };
  }
  return { ok: true };
}

function moniepointOccurredAt(value: unknown, fallback: unknown): Date | null {
  if (typeof value === "string") {
    const iso = new Date(value);
    if (!Number.isNaN(iso.getTime())) return iso;
    const match = /^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/.exec(value);
    if (match) {
      const [, y, m, d, h, min, s] = match;
      const parsed = new Date(`${y}-${m}-${d}T${h}:${min}:${s}+01:00`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
  }
  if (typeof fallback === "string") {
    const parsed = new Date(fallback);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

/** Parses the documented Moniepoint POS purchase and transfer notification envelope. */
export function parseMoniepointEvent(raw: Buffer): ParseResult {
  let body: unknown;
  try { body = JSON.parse(raw.toString("utf8")); } catch { return { ok: false, error: "Body must be JSON" }; }
  if (!isRecord(body) || !isRecord(body.data)) return { ok: false, error: "Missing Moniepoint data" };
  const data = body.data;
  const providerEventId = idField(body.eventId);
  const eventType = typeof body.eventType === "string" ? body.eventType : "";
  if (!providerEventId) return { ok: false, error: "Invalid eventId" };
  if (!["V1_POS_PURCHASE_TRANSACTION", "V1_POS_TRANSFER_TRANSACTION"].includes(eventType)) {
    return { ok: false, error: "Unsupported Moniepoint event type" };
  }
  const providerTransactionId = idField(data.transactionReference);
  const providerTerminalId = idField(data.terminalSerial);
  const amountKobo = data.amount;
  const occurredAt = moniepointOccurredAt(data.transactionTime, body.createdAt);
  if (!providerTransactionId || !providerTerminalId || !occurredAt) return { ok: false, error: "Invalid Moniepoint transaction identifiers or time" };
  if (typeof amountKobo !== "number" || !Number.isSafeInteger(amountKobo) || amountKobo <= 0 || amountKobo > MAX_TRANSACTION_KOBO) {
    return { ok: false, error: "Invalid Moniepoint amount" };
  }
  const rawStatus = typeof data.transactionStatus === "string" ? data.transactionStatus.toUpperCase() : "";
  const rawCode = typeof data.responseCode === "string" ? data.responseCode : "";
  const status: PaymentStatus = (rawStatus === "COMPLETED" || rawStatus === "APPROVED" || rawCode === "00" || rawCode === "20000")
    ? "successful" : "failed";
  const metadata: Record<string, string> = {};
  const set = (key: string, value: unknown) => { if (typeof value === "string" && value.trim()) metadata[key] = value.trim().slice(0, 80); };
  set("reference", data.merchantReference); set("rrn", data.retrievalReferenceNumber);
  set("narration", data.narration); set("responseCode", data.responseCode); set("responseMessage", data.responseMessage);
  return { ok: true, event: {
    providerEventId, eventType, occurredAt, providerTransactionId, providerTerminalId,
    method: eventType === "V1_POS_PURCHASE_TRANSACTION" ? "card" : "transfer",
    status, amountKobo, currency: "NGN", reversalOfProviderTransactionId: null, metadata,
  }};
}

/** Parses the documented Petrotrack sandbox payload (see docs/payments-pilot.md). */
export function parseSandboxEvent(raw: Buffer): ParseResult {
  let body: unknown;
  try {
    body = JSON.parse(raw.toString("utf8"));
  } catch {
    return { ok: false, error: "Body must be JSON" };
  }
  if (!isRecord(body) || !isRecord(body.transaction)) return { ok: false, error: "Missing transaction" };
  const tx = body.transaction;

  const providerEventId = idField(body.eventId);
  if (!providerEventId) return { ok: false, error: "Invalid eventId" };
  const eventType = body.eventType === "pos.transaction" ? body.eventType : null;
  if (!eventType) return { ok: false, error: "Unsupported eventType" };
  const occurredAt = typeof body.occurredAt === "string" ? new Date(body.occurredAt) : null;
  if (!occurredAt || Number.isNaN(occurredAt.getTime())) return { ok: false, error: "Invalid occurredAt" };

  const providerTransactionId = idField(tx.id);
  if (!providerTransactionId) return { ok: false, error: "Invalid transaction.id" };
  const providerTerminalId = idField(tx.terminalId);
  if (!providerTerminalId) return { ok: false, error: "Invalid transaction.terminalId" };
  const method = (PAYMENT_METHODS as readonly unknown[]).includes(tx.method) ? tx.method as PaymentMethod : null;
  if (!method) return { ok: false, error: "Invalid transaction.method" };
  const status = (PAYMENT_STATUSES as readonly unknown[]).includes(tx.status) ? tx.status as PaymentStatus : null;
  if (!status) return { ok: false, error: "Invalid transaction.status" };
  const amountKobo = tx.amountKobo;
  if (typeof amountKobo !== "number" || !Number.isSafeInteger(amountKobo) || amountKobo <= 0 || amountKobo > MAX_TRANSACTION_KOBO) {
    return { ok: false, error: "Invalid transaction.amountKobo" };
  }
  if ((tx.currency ?? "NGN") !== "NGN") return { ok: false, error: "Only NGN is supported" };

  let reversalOf: string | null = null;
  if (status === "reversal") {
    reversalOf = idField(tx.reversalOf);
    if (!reversalOf) return { ok: false, error: "A reversal requires transaction.reversalOf" };
    if (reversalOf === providerTransactionId) return { ok: false, error: "A transaction cannot reverse itself" };
  }

  // Allow-listed, length-capped metadata only; card numbers are never stored.
  const metadata: Record<string, string> = {};
  for (const key of METADATA_KEYS) {
    const value = tx[key];
    if (typeof value === "string" && value.trim()) metadata[key] = value.trim().slice(0, 80);
  }

  return {
    ok: true,
    event: {
      providerEventId,
      eventType,
      occurredAt,
      providerTransactionId,
      providerTerminalId,
      method,
      status,
      amountKobo,
      currency: "NGN",
      reversalOfProviderTransactionId: reversalOf,
      metadata,
    },
  };
}

/** Balanced journal lines for an event. Failed attempts move no money. */
export function ledgerLinesFor(event: Pick<NormalizedPaymentEvent, "method" | "status" | "amountKobo">): LedgerLine[] {
  if (event.status === "failed") return [];
  const collections = `${event.method}_collections`;
  const clearing = `${event.method}_clearing`;
  const [debit, credit] = event.status === "reversal" ? [clearing, collections] : [collections, clearing];
  return [
    { account: debit, direction: "debit", amountKobo: event.amountKobo },
    { account: credit, direction: "credit", amountKobo: event.amountKobo },
  ];
}

export function sandboxSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const secret = env.PAYMENTS_SANDBOX_WEBHOOK_SECRET ?? "";
  if (secret.length < 32) return null;
  if (env.NODE_ENV === "production" && env.PAYMENTS_ALLOW_SANDBOX !== "true") return null;
  return secret;
}

/** Shift business dates are Nigerian station days (Africa/Lagos, UTC+1, no DST). */
export function businessDayWindow(date: string): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const [y, m, d] = date.split("-").map(Number);
  const utcMidnight = Date.UTC(y, m - 1, d);
  if (new Date(utcMidnight).toISOString().slice(0, 10) !== date) return null;
  const from = new Date(utcMidnight - 60 * 60 * 1000); // 00:00 in Lagos (UTC+1)
  return { from, to: new Date(from.getTime() + 24 * 60 * 60 * 1000) };
}
