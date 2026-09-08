export type WorkflowRecord = Record<string, unknown>;
export type WorkflowCollection = "deliveries" | "expenses";

const DELIVERY_STATUS_RANK: Record<string, number> = {
  draft: 1,
  pending: 2,
  pending_acc: 2,
  pending_md: 3,
  returned: 4,
  rejected: 4,
  md_approved: 5,
  approved: 5,
};

const EXPENSE_STATUS_RANK: Record<string, number> = {
  pending: 1,
  acc_forwarded: 2,
  rejected: 3,
  approved: 3,
};

function record(value: unknown): value is WorkflowRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function idOf(value: WorkflowRecord): string {
  return String(value.id ?? "").trim();
}

function revisionOf(value: WorkflowRecord, collection: WorkflowCollection): number {
  const raw = Number(value[collection === "deliveries" ? "workflowVersion" : "revision"]);
  return Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
}

function statusOf(value: WorkflowRecord): string {
  return String(value.approvalStatus ?? value.status ?? "draft");
}

function statusRank(value: WorkflowRecord, collection: WorkflowCollection): number {
  const ranks = collection === "deliveries" ? DELIVERY_STATUS_RANK : EXPENSE_STATUS_RANK;
  return ranks[statusOf(value)] ?? 0;
}

function activityMs(value: WorkflowRecord): number {
  return [
    value.updatedAt,
    value.submittedAt,
    value.approvedAt,
    value.approvedDt,
    value.rejectedAt,
    value.createdAt,
    value.dt,
  ]
    .map(timestamp => Date.parse(String(timestamp ?? "")))
    .filter(Number.isFinite)
    .reduce((latest, timestamp) => Math.max(latest, timestamp), 0);
}

export function workflowTombstones(value: unknown): WorkflowRecord[] {
  return Array.isArray(value)
    ? value.filter(record).filter(item => idOf(item))
    : [];
}

export function mergeWorkflowTombstones(existing: unknown, incoming: unknown): WorkflowRecord[] {
  const merged = new Map<string, WorkflowRecord>();
  for (const candidate of [...workflowTombstones(existing), ...workflowTombstones(incoming)]) {
    const id = idOf(candidate);
    const previous = merged.get(id);
    const candidateRevision = Math.max(
      revisionOf(candidate, "deliveries"),
      revisionOf(candidate, "expenses"),
    );
    const previousRevision = previous
      ? Math.max(revisionOf(previous, "deliveries"), revisionOf(previous, "expenses"))
      : -1;
    const candidateDeletedAt = Date.parse(String(candidate.deletedAt ?? ""));
    const previousDeletedAt = Date.parse(String(previous?.deletedAt ?? ""));
    if (
      !previous
      || candidateRevision > previousRevision
      || (
        candidateRevision === previousRevision
        && Number.isFinite(candidateDeletedAt)
        && (!Number.isFinite(previousDeletedAt) || candidateDeletedAt > previousDeletedAt)
      )
    ) {
      merged.set(id, candidate);
    }
  }
  return [...merged.values()];
}

export function isWorkflowRecordDeleted(
  value: WorkflowRecord,
  tombstones: unknown,
  collection: WorkflowCollection,
): boolean {
  const deletion = workflowTombstones(tombstones).find(item => idOf(item) === idOf(value));
  if (!deletion) return false;
  return revisionOf(value, collection) <= Math.max(
    Number(deletion.workflowVersion) || 0,
    Number(deletion.revision) || 0,
  );
}

/**
 * Client snapshots are reconciliation input, not authority. Prefer the
 * monotonic workflow revision, then status rank for legacy records, and only
 * use timestamps as a final tie breaker for old records without revisions.
 */
export function mergeWorkflowRecords(
  existing: unknown,
  incoming: unknown,
  collection: WorkflowCollection,
  tombstones?: unknown,
): WorkflowRecord[] {
  const merged = new Map<string, WorkflowRecord>();
  const add = (candidate: unknown) => {
    if (!record(candidate)) return;
    const id = idOf(candidate);
    if (!id || isWorkflowRecordDeleted(candidate, tombstones, collection)) return;
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

    const currentRank = statusRank(previous, collection);
    const candidateRank = statusRank(candidate, collection);
    if (
      candidateRank > currentRank
      || (candidateRank === currentRank && activityMs(candidate) >= activityMs(previous))
    ) {
      merged.set(id, candidate);
    }
  };

  if (Array.isArray(existing)) existing.forEach(add);
  if (Array.isArray(incoming)) incoming.forEach(add);
  return [...merged.values()];
}