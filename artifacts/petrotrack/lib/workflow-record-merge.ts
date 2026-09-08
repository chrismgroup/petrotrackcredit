export type WorkflowRecord = Record<string, any>;
export type WorkflowCollection = 'deliveries' | 'expenses';

const DELIVERY_STATUS_RANK: Record<string, number> = {
  draft: 1, pending: 2, pending_acc: 2, pending_md: 3,
  returned: 4, rejected: 4, md_approved: 5, approved: 5,
};
const EXPENSE_STATUS_RANK: Record<string, number> = {
  pending: 1, acc_forwarded: 2, rejected: 3, approved: 3,
};

const idOf = (value: WorkflowRecord) => String(value.id ?? '').trim();
const revisionOf = (value: WorkflowRecord, collection: WorkflowCollection) => {
  const raw = Number(value[collection === 'deliveries' ? 'workflowVersion' : 'revision']);
  return Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
};
const statusRank = (value: WorkflowRecord, collection: WorkflowCollection) =>
  (collection === 'deliveries' ? DELIVERY_STATUS_RANK : EXPENSE_STATUS_RANK)[
    String(value.approvalStatus ?? value.status ?? 'draft')
  ] ?? 0;
const activityMs = (value: WorkflowRecord) => [
  value.updatedAt, value.submittedAt, value.approvedAt, value.approvedDt,
  value.rejectedAt, value.createdAt, value.dt,
].map(value => Date.parse(String(value ?? ''))).filter(Number.isFinite)
  .reduce((latest, timestamp) => Math.max(latest, timestamp), 0);

export function mergeWorkflowRecords<T extends WorkflowRecord>(
  existing: T[],
  incoming: T[],
  collection: WorkflowCollection,
  tombstones: WorkflowRecord[] = [],
): T[] {
  const deleted = new Map(tombstones.map(item => [
    idOf(item),
    Math.max(Number(item.workflowVersion) || 0, Number(item.revision) || 0),
  ]));
  const merged = new Map<string, T>();
  const add = (candidate: T) => {
    const id = idOf(candidate);
    if (!id || revisionOf(candidate, collection) <= (deleted.get(id) ?? -1)) return;
    const previous = merged.get(id);
    if (!previous) {
      merged.set(id, candidate);
      return;
    }
    const currentRevision = revisionOf(previous, collection);
    const candidateRevision = revisionOf(candidate, collection);
    if (candidateRevision !== currentRevision) {
      if (candidateRevision > currentRevision) merged.set(id, candidate);
      return;
    }
    if (
      statusRank(candidate, collection) > statusRank(previous, collection)
      || (statusRank(candidate, collection) === statusRank(previous, collection)
        && activityMs(candidate) >= activityMs(previous))
    ) merged.set(id, candidate);
  };
  existing.forEach(add);
  incoming.forEach(add);
  return [...merged.values()];
}