import { createHash, randomUUID } from "crypto";

export const MAINTENANCE_STATUSES = ["pending", "awaiting_approval", "commenced", "open", "done", "closed"] as const;
export type MaintenanceStatus = typeof MAINTENANCE_STATUSES[number];

const DECISION_ROLES = new Set(["md", "ceo"]);
const STATUS_TRANSITIONS: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  pending: [],
  awaiting_approval: ["open", "commenced", "closed"],
  commenced: ["awaiting_approval", "open", "done"],
  open: ["awaiting_approval", "commenced", "done"],
  done: ["open", "closed"],
  closed: [],
};

export function isMaintenanceDecisionRole(role: unknown): boolean {
  return typeof role === "string" && DECISION_ROLES.has(role);
}

export function createMaintenanceTaskId(now = new Date()): string {
  return `MNT-${now.getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export function isAllowedMaintenanceTransition(current: unknown, next: unknown): boolean {
  if (!MAINTENANCE_STATUSES.includes(current as MaintenanceStatus)) return false;
  if (!MAINTENANCE_STATUSES.includes(next as MaintenanceStatus)) return false;
  return STATUS_TRANSITIONS[current as MaintenanceStatus].includes(next as MaintenanceStatus);
}

type JsonRecord = Record<string, unknown>;

export function normalizeMaintenanceRecord(item: JsonRecord): JsonRecord {
  if (typeof item.taskId === "string" && item.taskId && typeof item.status === "string") {
    return item;
  }
  const submittedAt = typeof item.submittedAt === "string"
    ? item.submittedAt
    : new Date(0).toISOString();
  const year = /^\d{4}/.test(String(item.date ?? "")) ? String(item.date).slice(0, 4) : submittedAt.slice(0, 4);
  const legacyKey = `${String(item.id ?? "")}|${String(item.title ?? "")}|${String(item.date ?? "")}`;
  const suffix = createHash("sha1").update(legacyKey).digest("hex").slice(0, 8).toUpperCase();
  const status = item.st === "Done" ? "done" : "open";
  const submittedBy = typeof item.submittedBy === "string" && item.submittedBy
    ? item.submittedBy
    : String(item.by ?? "Legacy request");
  const history = Array.isArray(item.history) && item.history.length > 0
    ? item.history
    : [{
        id: `legacy-${suffix}`,
        action: "Legacy request imported",
        actor: submittedBy,
        detail: "Converted to the current maintenance workflow.",
        at: submittedAt,
      }];
  return {
    ...item,
    taskId: `MNT-${year}-${suffix}`,
    submittedBy,
    submittedByName: item.submittedByName ?? submittedBy,
    submittedAt,
    status,
    st: status === "done" ? "Done" : "Open",
    history,
    updatedAt: item.updatedAt ?? submittedAt,
  };
}