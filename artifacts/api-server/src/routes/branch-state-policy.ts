type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const BRANCH_SCOPED_ARRAY_KEYS = new Set([
  "tanks", "lpgTanks", "pumps", "expenses", "sales", "dips", "deliveries",
  "maintenance", "inventoryLog", "stockLogs", "startupStocks", "companyAssets",
  "priceHistory", "priceProposals", "budgets", "shiftReports", "deliveryEvidences",
  "staff", "userAccounts", "hrEmployees",
  "creditCustomers", "customerPayments",
]);

const BRANCH_PRIVATE_HIDDEN_KEYS = new Set([
  "audit", "financialEntry", "legalMatters", "meetingMinutes", "corpProjects",
]);

export function isBranchScopedArrayKey(key: string): boolean {
  return BRANCH_SCOPED_ARRAY_KEYS.has(key);
}

export function canManageFinancialEntry(role: string | undefined): boolean {
  return role === "admin" || role === "acc";
}

export function branchScopedStateForBranchUser(key: string, data: unknown, branchId: string | null): unknown {
  if (BRANCH_PRIVATE_HIDDEN_KEYS.has(key)) return Array.isArray(data) ? [] : {};
  if (!branchId) {
    if (key === "branches" || BRANCH_SCOPED_ARRAY_KEYS.has(key)) return [];
    return data;
  }
  if (key === "branches") {
    return Array.isArray(data)
      ? data.filter(value => isJsonRecord(value) && String(value.id ?? "") === branchId)
      : [];
  }
  if (BRANCH_SCOPED_ARRAY_KEYS.has(key)) {
    return Array.isArray(data)
      ? data.filter(value => isJsonRecord(value) && String(value.branchId ?? "") === branchId)
      : [];
  }
  if (key === "prices" && isJsonRecord(data)) {
    const branchPrices = isJsonRecord(data.branchPrices) ? data.branchPrices : {};
    return {
      ...data,
      branchPrices: branchPrices[branchId] === undefined
        ? {}
        : { [branchId]: branchPrices[branchId] },
    };
  }
  return data;
}

export function branchPumpMeters(data: unknown, pumps: unknown): Record<string, unknown> {
  if (!isJsonRecord(data) || !Array.isArray(pumps)) return {};
  const pumpIds = new Set(pumps.filter(isJsonRecord).map(pump => String(pump.id ?? "")).filter(Boolean));
  return Object.fromEntries(Object.entries(data).filter(([pumpId]) => pumpIds.has(pumpId)));
}

/** Repairs legacy reports that predate mandatory branch ownership. Reports
 * whose pump is unknown remain unassigned instead of leaking into each branch. */
export function inferPumpReportBranches(data: unknown, pumps: unknown): unknown {
  if (!Array.isArray(data) || !Array.isArray(pumps)) return data;
  const branchByPump = new Map(
    pumps.filter(isJsonRecord)
      .map(pump => [String(pump.id ?? ''), String(pump.branchId ?? '')] as const)
      .filter(([pumpId, branchId]) => pumpId && branchId),
  );
  return data.map(value => {
    if (!isJsonRecord(value) || value.branchId) return value;
    const branchId = branchByPump.get(String(value.pumpId ?? ''));
    return branchId ? { ...value, branchId } : value;
  });
}

export function inferDeliveryEvidenceBranches(data: unknown, deliveries: unknown): unknown {
  if (!Array.isArray(data) || !Array.isArray(deliveries)) return data;
  const branchByDelivery = new Map(
    deliveries.filter(isJsonRecord).map(delivery => [String(delivery.id ?? ""), String(delivery.branchId ?? "")]),
  );
  return data.map(value => {
    if (!isJsonRecord(value) || value.branchId) return value;
    const branchId = branchByDelivery.get(String(value.delivId ?? ""));
    return branchId ? { ...value, branchId } : value;
  });
}
