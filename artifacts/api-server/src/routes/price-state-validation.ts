type JsonRecord = Record<string, unknown>;

type PriceRecordValidationResult =
  | { ok: true }
  | { ok: false; error: string };

function isNonNegativeFinitePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isPositiveFinitePrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function hasRequiredPriceLabel(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validatePriceHistoryRecord(value: unknown, index: number): PriceRecordValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: `priceHistory[${index}] must be an object` };
  }
  const record = value as JsonRecord;
  if (!hasRequiredPriceLabel(record.prod)) {
    return { ok: false, error: `priceHistory[${index}].prod must be a non-empty string` };
  }
  if (!hasRequiredPriceLabel(record.by)) {
    return { ok: false, error: `priceHistory[${index}].by must be a non-empty string` };
  }
  if (!isNonNegativeFinitePrice(record.oldPrice)) {
    return { ok: false, error: `priceHistory[${index}].oldPrice must be a finite non-negative number` };
  }
  if (!isPositiveFinitePrice(record.newPrice)) {
    return { ok: false, error: `priceHistory[${index}].newPrice must be a finite positive number` };
  }
  return { ok: true };
}

function validatePriceProposalRecord(value: unknown, index: number): PriceRecordValidationResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: `priceProposals[${index}] must be an object` };
  }
  const record = value as JsonRecord;
  if (!hasRequiredPriceLabel(record.prod)) {
    return { ok: false, error: `priceProposals[${index}].prod must be a non-empty string` };
  }
  if (!hasRequiredPriceLabel(record.proposedBy)) {
    return { ok: false, error: `priceProposals[${index}].proposedBy must be a non-empty string` };
  }
  if (!isNonNegativeFinitePrice(record.currentPrice)) {
    return { ok: false, error: `priceProposals[${index}].currentPrice must be a finite non-negative number` };
  }
  if (!isPositiveFinitePrice(record.proposedPrice)) {
    return { ok: false, error: `priceProposals[${index}].proposedPrice must be a finite positive number` };
  }
  return { ok: true };
}

export function validatePriceHistoryPayload(data: unknown): string | null {
  if (!Array.isArray(data)) return "priceHistory must be an array";
  for (let index = 0; index < data.length; index += 1) {
    const result = validatePriceHistoryRecord(data[index], index);
    if (!result.ok) return result.error;
  }
  return null;
}

export function validatePriceProposalsPayload(data: unknown): string | null {
  if (!Array.isArray(data)) return "priceProposals must be an array";
  for (let index = 0; index < data.length; index += 1) {
    const result = validatePriceProposalRecord(data[index], index);
    if (!result.ok) return result.error;
  }
  return null;
}