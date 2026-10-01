type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function nonNegative(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

/**
 * Repairs the known September 2026 bank-charge rollover and removes obsolete
 * loan fields from persisted state. Version 6 keeps only complete, editable
 * rows in `bankLoans`; valid current loans are preserved.
 */
export function repairFinancialEntryBankChargePeriod(value: unknown): unknown {
  if (!isRecord(value)) return value;

  let repaired = value;

  if (nonNegative(value.schemaVersion) < 5 && !isRecord(value.months)) {
    if (nonNegative(value.bankCharges) <= 0) {
      repaired = value;
    } else {
      const {
        capitalInjection: _capitalInjection,
        bankCharges: _bankCharges,
        loanPrincipalRepayment: _loanPrincipalRepayment,
        loanInterest: _loanInterest,
        customerPaymentsReceived: _customerPaymentsReceived,
        customerPaymentsByBranch: _customerPaymentsByBranch,
        payeProvision: _payeProvision,
        payeRemitted: _payeRemitted,
        citaProvision: _citaProvision,
        citaPaid: _citaPaid,
        startupCapital: _startupCapital,
        startupCapitalSource: _startupCapitalSource,
        startupCapitalMonth: _startupCapitalMonth,
        closingOperatingCapital: _closingOperatingCapital,
        finalizedNetProfit: _finalizedNetProfit,
        finalizedAt: _finalizedAt,
        financialPeriodMonth: _financialPeriodMonth,
        ...position
      } = value;
      const september = {
        capitalInjection: nonNegative(value.capitalInjection),
        bankCharges: nonNegative(value.bankCharges),
        loanPrincipalRepayment: nonNegative(value.loanPrincipalRepayment ?? value.loanInterest),
        loanInterest: 0,
        customerPaymentsReceived: nonNegative(value.customerPaymentsReceived),
        customerPaymentsByBranch: isRecord(value.customerPaymentsByBranch) ? value.customerPaymentsByBranch : {},
        payeProvision: nonNegative(value.payeProvision),
        payeRemitted: nonNegative(value.payeRemitted),
        citaProvision: nonNegative(value.citaProvision),
        citaPaid: nonNegative(value.citaPaid),
        startupCapital: Number.isFinite(Number(value.startupCapital)) ? Number(value.startupCapital) : 0,
        startupCapitalSource: value.startupCapitalSource === "admin" ? "admin" : "rollover",
        ...(Number.isFinite(Number(value.closingOperatingCapital))
          ? { closingOperatingCapital: Number(value.closingOperatingCapital) }
          : {}),
        ...(Number.isFinite(Number(value.finalizedNetProfit))
          ? { finalizedNetProfit: Number(value.finalizedNetProfit) }
          : {}),
        ...(typeof value.finalizedAt === "string" && value.finalizedAt
          ? { finalizedAt: value.finalizedAt }
          : {}),
        updatedBy: typeof value.updatedBy === "string" ? value.updatedBy : "",
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
      };
      repaired = {
        ...position,
        schemaVersion: 5,
        months: {
          "2026-09": september,
          "2026-10": {
            bankCharges: 0,
            startupCapital: september.closingOperatingCapital ?? september.startupCapital,
            startupCapitalSource: "rollover",
          },
        },
      };
    }
  } else if (nonNegative(value.schemaVersion) < 5 && isRecord(value.months)) {
    const months = { ...value.months };
    const october = isRecord(months["2026-10"]) ? months["2026-10"] : null;
    const carriedCharge = nonNegative(october?.bankCharges);
    if (carriedCharge > 0) {
      const september = isRecord(months["2026-09"]) ? months["2026-09"] : {};
      months["2026-09"] = {
        ...september,
        bankCharges: nonNegative(september.bankCharges) > 0
          ? nonNegative(september.bankCharges)
          : carriedCharge,
      };
      months["2026-10"] = { ...october, bankCharges: 0 };
    }
    repaired = { ...value, schemaVersion: 5, months };
  }

  const {
    bankLoan: _bankLoan,
    bankLoanAmount: _bankLoanAmount,
    loanAmount: _loanAmount,
    loanBank: _loanBank,
    bankLoanDetails: _bankLoanDetails,
    ...canonical
  } = repaired;
  const bankLoans = Array.isArray(repaired.bankLoans)
    ? repaired.bankLoans
      .filter(isRecord)
      .map(loan => ({
        bank: typeof loan.bank === "string" ? loan.bank.trim() : "",
        amount: nonNegative(loan.amount),
      }))
      .filter(loan => loan.bank.length > 0 && loan.amount > 0)
    : [];

  return { ...canonical, schemaVersion: 6, bankLoans };
}
