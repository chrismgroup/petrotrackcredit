const CURRENT_YEAR = new Date().getFullYear();

export interface VesselFieldErrors {
  imoNumber?: string;
  dwt?: string;
  grt?: string;
  yearBuilt?: string;
  loa?: string;
  beam?: string;
  draft?: string;
}

export function validateIMONumber(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const trimmed = value.trim();
  if (!/^\d{7}$/.test(trimmed)) {
    return 'IMO number must be exactly 7 digits';
  }
  const digits = trimmed.split('').map(Number);
  const weights = [7, 6, 5, 4, 3, 2];
  const sum = digits.slice(0, 6).reduce((acc, d, i) => acc + d * weights[i], 0);
  if ((sum % 10) !== digits[6]) {
    return 'IMO number has an invalid check digit';
  }
  return undefined;
}

export function validatePositiveDecimal(
  value: string,
  label: string,
  min: number,
  max: number,
): string | undefined {
  if (!value.trim()) return undefined;
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return `${label} must be a number`;
  if (num <= 0) return `${label} must be greater than 0`;
  if (num < min) return `${label} must be at least ${min}`;
  if (num > max) return `${label} must be at most ${max.toLocaleString()}`;
  return undefined;
}

export function validateYearBuilt(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const num = Number(value);
  if (!Number.isInteger(num) || isNaN(num)) return 'Year built must be a whole number';
  if (num < 1900) return 'Year built must be 1900 or later';
  if (num > CURRENT_YEAR + 1) return `Year built cannot be in the future`;
  return undefined;
}

export function validateVesselFields(fields: {
  imoNumber?: string;
  dwt?: string;
  grt?: string;
  yearBuilt?: string;
  loa?: string;
  beam?: string;
  draft?: string;
}): VesselFieldErrors {
  const errors: VesselFieldErrors = {};

  const imoErr = validateIMONumber(fields.imoNumber ?? '');
  if (imoErr) errors.imoNumber = imoErr;

  const dwtErr = validatePositiveDecimal(fields.dwt ?? '', 'DWT', 1, 500_000);
  if (dwtErr) errors.dwt = dwtErr;

  const grtErr = validatePositiveDecimal(fields.grt ?? '', 'GRT', 1, 300_000);
  if (grtErr) errors.grt = grtErr;

  const yearErr = validateYearBuilt(fields.yearBuilt ?? '');
  if (yearErr) errors.yearBuilt = yearErr;

  const loaErr = validatePositiveDecimal(fields.loa ?? '', 'LOA', 1, 500);
  if (loaErr) errors.loa = loaErr;

  const beamErr = validatePositiveDecimal(fields.beam ?? '', 'Beam', 1, 100);
  if (beamErr) errors.beam = beamErr;

  const draftErr = validatePositiveDecimal(fields.draft ?? '', 'Draft', 0.1, 30);
  if (draftErr) errors.draft = draftErr;

  return errors;
}

export function hasVesselErrors(errors: VesselFieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}
