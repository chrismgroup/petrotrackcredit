import assert from "node:assert/strict";
import test from "node:test";

import {
  businessDayWindow,
  ledgerLinesFor,
  parseSandboxEvent,
  sandboxSecret,
  signSandboxPayload,
  verifySandboxSignature,
} from "./payments-webhook";

const SECRET = "s".repeat(40);
const NOW_MS = Date.UTC(2026, 9, 18, 12, 0, 0);
const TS = String(Math.floor(NOW_MS / 1000));

function payload(tx: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return Buffer.from(JSON.stringify({
    eventId: "evt_1",
    eventType: "pos.transaction",
    occurredAt: "2026-10-18T11:59:00Z",
    transaction: { id: "txn_1", terminalId: "2KUD0001", method: "card", status: "successful", amountKobo: 1_500_000, ...tx },
    ...extra,
  }));
}

test("accepts a correctly signed sandbox payload", () => {
  const raw = payload();
  const signature = signSandboxPayload(SECRET, TS, raw);
  assert.deepEqual(verifySandboxSignature(SECRET, raw, TS, signature, NOW_MS), { ok: true });
});

test("rejects tampered bodies, wrong secrets, missing headers and stale timestamps", () => {
  const raw = payload();
  const signature = signSandboxPayload(SECRET, TS, raw);
  assert.equal(verifySandboxSignature(SECRET, payload({ amountKobo: 9 }), TS, signature, NOW_MS).ok, false);
  assert.equal(verifySandboxSignature("x".repeat(40), raw, TS, signature, NOW_MS).ok, false);
  assert.equal(verifySandboxSignature(SECRET, raw, undefined, signature, NOW_MS).ok, false);
  assert.equal(verifySandboxSignature(SECRET, raw, TS, undefined, NOW_MS).ok, false);
  assert.equal(verifySandboxSignature(SECRET, raw, TS, signature, NOW_MS + 301_000).ok, false);
  assert.equal(verifySandboxSignature(SECRET, raw, TS, "v1=short", NOW_MS).ok, false);
});

test("normalizes a sandbox event and keeps only allow-listed metadata", () => {
  const result = parseSandboxEvent(payload({ rrn: "123", pan: "5399410000009098", cardScheme: "Verve" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.event.amountKobo, 1_500_000);
  assert.equal(result.event.providerTerminalId, "2KUD0001");
  assert.deepEqual(result.event.metadata, { rrn: "123", cardScheme: "Verve" });
});

test("rejects invalid amounts, methods, currencies and self-reversals", () => {
  for (const tx of [
    { amountKobo: 0 },
    { amountKobo: -100 },
    { amountKobo: 10.5 },
    { amountKobo: "1500" },
    { method: "cash" },
    { currency: "USD" },
    { status: "reversal" },
    { status: "reversal", reversalOf: "txn_1" },
    { terminalId: "bad id with spaces" },
  ]) {
    assert.equal(parseSandboxEvent(payload(tx)).ok, false, JSON.stringify(tx));
  }
  assert.equal(parseSandboxEvent(Buffer.from("not json")).ok, false);
  assert.equal(parseSandboxEvent(payload({}, { eventType: "other" })).ok, false);
});

test("posts balanced ledger lines; reversals swap sides and failures post nothing", () => {
  assert.deepEqual(ledgerLinesFor({ method: "card", status: "successful", amountKobo: 500 }), [
    { account: "card_collections", direction: "debit", amountKobo: 500 },
    { account: "card_clearing", direction: "credit", amountKobo: 500 },
  ]);
  assert.deepEqual(ledgerLinesFor({ method: "transfer", status: "reversal", amountKobo: 500 }), [
    { account: "transfer_clearing", direction: "debit", amountKobo: 500 },
    { account: "transfer_collections", direction: "credit", amountKobo: 500 },
  ]);
  assert.deepEqual(ledgerLinesFor({ method: "card", status: "failed", amountKobo: 500 }), []);
});

test("sandbox is disabled without a strong secret and in production unless allowed", () => {
  assert.equal(sandboxSecret({}), null);
  assert.equal(sandboxSecret({ PAYMENTS_SANDBOX_WEBHOOK_SECRET: "short" }), null);
  assert.equal(sandboxSecret({ PAYMENTS_SANDBOX_WEBHOOK_SECRET: SECRET }), SECRET);
  assert.equal(sandboxSecret({ PAYMENTS_SANDBOX_WEBHOOK_SECRET: SECRET, NODE_ENV: "production" }), null);
  assert.equal(sandboxSecret({ PAYMENTS_SANDBOX_WEBHOOK_SECRET: SECRET, NODE_ENV: "production", PAYMENTS_ALLOW_SANDBOX: "true" }), SECRET);
});

test("maps a business date to the Lagos calendar day", () => {
  const window = businessDayWindow("2026-10-18");
  assert.equal(window?.from.toISOString(), "2026-10-17T23:00:00.000Z");
  assert.equal(window?.to.toISOString(), "2026-10-18T23:00:00.000Z");
  for (const bad of ["", "2026-02-30", "18-10-2026", "2026-10-18T00:00"]) assert.equal(businessDayWindow(bad), null, bad);
});
