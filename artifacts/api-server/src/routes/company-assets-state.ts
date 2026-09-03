export type CompanyAssetRecord = Record<string, unknown>;

function records(value: unknown): CompanyAssetRecord[] {
  return Array.isArray(value)
    ? value.filter(item => item && typeof item === "object" && !Array.isArray(item)) as CompanyAssetRecord[]
    : [];
}

function recordId(record: CompanyAssetRecord): string {
  return typeof record.id === "string" ? record.id.trim() : "";
}

export function validateCompanyAssetsPayload(value: unknown): string | null {
  if (!Array.isArray(value)) return "companyAssets must be an array";
  const ids = new Set<string>();
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return `companyAssets[${index}] must be an object`;
    }
    const id = recordId(item as CompanyAssetRecord);
    if (!id) return `companyAssets[${index}].id is required`;
    if (ids.has(id)) return `companyAssets[${index}].id must be unique`;
    ids.add(id);
  }
  return null;
}

/**
 * Merge full client snapshots without treating an omitted record as a delete.
 * Existing records keep their exact JSON shape unless a same/newer explicit
 * update for that ID arrives. Deletion is handled by the dedicated endpoint.
 */
export function deletedCompanyAssetIds(value: unknown): Set<string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return new Set();
  return new Set(Object.keys(value as Record<string, unknown>).filter(Boolean));
}

export function mergeCompanyAssets(
  existing: unknown,
  incoming: unknown,
  deletedIds: Set<string> = new Set(),
): CompanyAssetRecord[] {
  const current = records(existing);
  const next = records(incoming);
  const merged = new Map<string, CompanyAssetRecord>();
  const unkeyed: CompanyAssetRecord[] = [];

  for (const asset of current) {
    const id = recordId(asset);
    if (id) merged.set(id, asset);
    else unkeyed.push(asset);
  }

  for (const candidate of next) {
    const id = recordId(candidate);
    // Snapshot writes are recovery-only. They may contribute a genuinely new
    // asset, but cannot edit an existing record or resurrect a deleted ID.
    if (!id || deletedIds.has(id) || merged.has(id)) continue;
    merged.set(id, candidate);
  }

  return [...unkeyed, ...merged.values()];
}

export function upsertCompanyAsset(
  existing: unknown,
  candidate: CompanyAssetRecord,
  serverUpdatedAt: string,
  actor: string,
  baseRevision: number | null,
):
  | { conflict: true; assets: CompanyAssetRecord[] }
  | { conflict: false; assets: CompanyAssetRecord[]; asset: CompanyAssetRecord } {
  const current = records(existing);
  const id = recordId(candidate);
  const previous = current.find(asset => recordId(asset) === id);
  const previousRevision = Number.isInteger(previous?.revision) && Number(previous?.revision) >= 0
    ? Number(previous?.revision)
    : 0;
  const previousBranchId = typeof previous?.branchId === "string" ? previous.branchId.trim() : "";
  const candidateBranchId = typeof candidate.branchId === "string" ? candidate.branchId.trim() : "";
  if (
    (previous && baseRevision !== previousRevision) ||
    (!previous && baseRevision !== null) ||
    (previousBranchId && candidateBranchId !== previousBranchId)
  ) {
    return { conflict: true, assets: current };
  }
  const asset: CompanyAssetRecord = {
    ...candidate,
    id,
    revision: previousRevision + 1,
    createdBy: previous?.createdBy ?? actor,
    createdAt: previous?.createdAt ?? candidate.createdAt ?? serverUpdatedAt,
    updatedBy: actor,
    updatedAt: serverUpdatedAt,
  };
  return {
    conflict: false,
    assets: [...current.filter(item => recordId(item) !== id), asset],
    asset,
  };
}

export function removeCompanyAsset(existing: unknown, id: string): CompanyAssetRecord[] {
  return records(existing).filter(asset => recordId(asset) !== id);
}