import { randomUUID } from "crypto";

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