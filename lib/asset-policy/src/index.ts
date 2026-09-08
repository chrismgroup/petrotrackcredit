export const COMPANY_ASSET_ALL_BRANCH_ROLES = [
  "admin",
  "acc",
  "md",
  "ceo",
  "csm",
  "mktg",
] as const;

export const COMPANY_ASSET_ASSIGNED_BRANCH_ROLES = ["mgr"] as const;

const allBranchRoles = new Set<string>(COMPANY_ASSET_ALL_BRANCH_ROLES);
const assignedBranchRoles = new Set<string>(COMPANY_ASSET_ASSIGNED_BRANCH_ROLES);

export function canManageCompanyAssets(role: string | null | undefined): boolean {
  return allBranchRoles.has(role ?? "") || assignedBranchRoles.has(role ?? "");
}

export function canManageAllCompanyAssetBranches(role: string | null | undefined): boolean {
  return allBranchRoles.has(role ?? "");
}

export function isCompanyAssetBranchScopedRole(role: string | null | undefined): boolean {
  return assignedBranchRoles.has(role ?? "");
}

export function canManageCompanyAssetBranch(
  role: string | null | undefined,
  assignedBranchId: string | null | undefined,
  assetBranchId: string | null | undefined,
): boolean {
  if (!canManageCompanyAssets(role)) return false;
  if (!isCompanyAssetBranchScopedRole(role)) return true;
  const assigned = String(assignedBranchId ?? "").trim();
  const assetBranch = String(assetBranchId ?? "").trim();
  return Boolean(assigned) && assigned === assetBranch;
}