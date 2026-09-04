import { Router, type IRouter } from "express";
import { isDeepStrictEqual } from "node:util";
import { eq, inArray, sql } from "drizzle-orm";
import { db, appStateTable, pumpReportsTable, staffUsersTable } from "@workspace/db";
import { broadcastRealtime } from "../lib/realtime";
import { normalizeMaintenanceRecord } from "./maintenance-workflow-rules";
import { createBackup, listBackups, restoreBackup } from "../lib/backup";
import {
  validatePriceHistoryPayload,
  validatePriceProposalsPayload,
} from "./price-state-validation";
import {
  deletedCompanyAssetIds,
  mergeCompanyAssets,
  removeCompanyAsset,
  upsertCompanyAsset,
  validateCompanyAssetsPayload,
} from "./company-assets-state";

const router: IRouter = Router();

const ALLOWED_KEYS = new Set([
  "companyInfo", "tanks", "lpgTanks", "pumps", "staff", "branches",
  "departments", "userAccounts", "prices", "priceHistory", "mgrPerms",
  "roleAccess", "userAccess", "expenses", "budgets", "sales", "dips",
  "deliveries", "maintenance", "audit", "messages", "tasks", "kpis",
  "actionItems",
  "companyFiles", "deliveryEvidences", "shiftReports", "hrEmployees",
  "hrHandbooks", "hrRecommendations", "complianceDocs", "priceProposals",
  "legalMatters", "corpProjects", "meetingMinutes",
  "broadcasts", "callLog", "pumpDailyReports", "pumpInitialMeters",
  "pumpLockedMeters", "inventoryLog", "financialEntry", "marketCompetitors",
  "myFolders", "myFolderFiles", "startupStocks", "stockSnapshotConfig",
  "stockLogs", "reportAccessPolicyVersion",
  "companyAssets",
]);
const COMMAND_OWNED_WORKFLOW_KEYS = new Set([
  "deliveries",
  "expenses",
  "budgets",
  "dips",
  "priceProposals",
]);
const MY_FOLDER_WRITE_ROLES = new Set(["admin", "acc", "mktg", "csm", "md", "ceo"]);
const COMPANY_ASSET_WRITE_ROLES = new Set(["admin", "acc", "md", "ceo", "csm", "mktg", "mgr"]);

function visibleMyFolderState(key: string, data: unknown, role?: string): unknown {
  if ((key !== "myFolders" && key !== "myFolderFiles") || MY_FOLDER_WRITE_ROLES.has(role ?? "")) {
    return data;
  }
  return Array.isArray(data)
    ? data.filter(value =>
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        (value as JsonRecord).section === "general",
      )
    : [];
}

// Keys that modify access control, credentials, or HR/legal/financial records.
// Only admin-role users may write to these.
const ADMIN_WRITE_KEYS = new Set([
  "userAccounts", "roleAccess", "userAccess", "mgrPerms",
  "hrEmployees", "hrHandbooks", "hrRecommendations",
  "companyFiles", "legalMatters", "meetingMinutes", "corpProjects",
  "companyInfo", "departments", "branches", "startupStocks", "stockSnapshotConfig",
  "reportAccessPolicyVersion",
]);

// Selling prices are operational. Managers may update only their own branch
// override; CEO, MD, and admin may update the network fallback.
const PRICE_WRITE_ROLES = new Set(["admin", "ceo", "md", "mgr"]);

const OPERATIONAL_KEYS = [
  "expenses", "budgets", "sales", "dips", "deliveries",
  "inventoryLog", "pumpDailyReports", "financialEntry", "messages",
  "stockLogs",
  "tasks", "kpis", "companyFiles", "deliveryEvidences", "hrEmployees",
  "actionItems",
  "hrHandbooks", "hrRecommendations", "priceProposals", "legalMatters",
  "corpProjects", "meetingMinutes", "broadcasts", "callLog", "priceHistory",
];

type JsonRecord = Record<string, unknown>;

function mergeActionItems(existing: unknown, incoming: unknown): JsonRecord[] {
  const current = Array.isArray(existing) ? existing.filter(value =>
    value && typeof value === "object" && !Array.isArray(value),
  ) as JsonRecord[] : [];
  const next = Array.isArray(incoming) ? incoming.filter(value =>
    value && typeof value === "object" && !Array.isArray(value),
  ) as JsonRecord[] : [];
  const merged = new Map(current.map(item => [String(item.id ?? ""), item]));
  for (const candidate of next) {
    const id = String(candidate.id ?? "");
    if (!id) continue;
    const previous = merged.get(id);
    // A closed item is an immutable archive record. Stale clients may send
    // their older open copy, but it must never reopen the archived item.
    if (previous?.status === "closed") continue;
    merged.set(id, candidate);
  }
  return Array.from(merged.values());
}

const BUDGET_STATUS_RANK: Record<string, number> = {
  draft: 1,
  submitted: 2,
  acc_forwarded: 3,
  rejected: 4,
  fully_approved: 5,
};

function budgetActivityMs(budget: JsonRecord): number {
  const workflow = Array.isArray(budget.workflow)
    ? budget.workflow.filter(step => step && typeof step === "object" && !Array.isArray(step)) as JsonRecord[]
    : [];
  const timestamps = [
    budget.submittedAt,
    budget.archivedAt,
    ...workflow.map(step => step.dt),
  ]
    .map(value => Date.parse(String(value ?? "")))
    .filter(value => Number.isFinite(value));
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

export function mergeBudgets(existing: unknown, incoming: unknown): JsonRecord[] {
  const merged = new Map<string, JsonRecord>();
  const add = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const budget = value as JsonRecord;
    const id = String(budget.id ?? "");
    if (!id) return;
    const current = merged.get(id);
    if (!current) {
      merged.set(id, budget);
      return;
    }

    // Archiving is additive metadata. A stale device that has not yet received
    // the archive must never restore the budget to the active list.
    if (current.archivedAt && !budget.archivedAt) return;
    if (budget.archivedAt && !current.archivedAt) {
      merged.set(id, budget);
      return;
    }

    const currentRank = BUDGET_STATUS_RANK[String(current.status ?? "")] ?? 0;
    const candidateRank = BUDGET_STATUS_RANK[String(budget.status ?? "")] ?? 0;
    const currentActivity = budgetActivityMs(current);
    const candidateActivity = budgetActivityMs(budget);
    if (
      candidateRank > currentRank
      || (candidateRank === currentRank && candidateActivity >= currentActivity)
    ) {
      merged.set(id, budget);
    }
  };

  if (Array.isArray(existing)) existing.forEach(add);
  if (Array.isArray(incoming)) incoming.forEach(add);
  return Array.from(merged.values());
}

export { validatePriceHistoryPayload, validatePriceProposalsPayload } from "./price-state-validation";

const PUMP_REPORT_STATUS_RANK: Record<string, number> = {
  pending_manager: 1,
  returned: 2,
  returned_attendant: 3,
  pending_accountant: 4,
  approved: 5,
};
const PUMP_REPORT_DELETIONS_KEY = "pumpReportDeletionTombstones";
const COMPANY_ASSET_DELETIONS_KEY = "companyAssetDeletionTombstones";

const DIP_STATUS_RANK: Record<string, number> = {
  pending: 1,
  rejected: 2,
  approved: 3,
};

function pumpReportActivityMs(report: JsonRecord): number {
  const timestamps = ["submittedAt", "mgrAt", "accAt", "dateCorrectedAt", "adminReturnedAt"]
    .map(key => Date.parse(String(report[key] ?? "")))
    .filter(value => Number.isFinite(value));
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

function pumpReportWorkflowVersion(report: JsonRecord): number {
  const version = Number(report.workflowVersion);
  return Number.isFinite(version) && version >= 0 ? version : 0;
}

function pumpReportDeletionIds(data: unknown): Set<string> {
  if (!Array.isArray(data)) return new Set();
  return new Set(data.flatMap(value => {
    if (typeof value === "string" && value) return [value];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const id = String((value as JsonRecord).id ?? "");
      return id ? [id] : [];
    }
    return [];
  }));
}

/**
 * Pump reports are edited by attendants, managers, and accountants on separate
 * devices. A client PUT contains its complete local array, so replacing the
 * server array would let an older device erase a newly submitted report.
 * Merge by report ID and keep the version with the latest workflow activity.
 */
function mergePumpDailyReports(existing: unknown, incoming: unknown, actorRole?: string): JsonRecord[] {
  const merged = new Map<string, JsonRecord>();

  const add = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const report = value as JsonRecord;
    const id = String(report.id ?? "");
    if (!id) return;

    const current = merged.get(id);
    if (!current) {
      merged.set(id, report);
      return;
    }
    const currentActivity = pumpReportActivityMs(current);
    const candidateActivity = pumpReportActivityMs(report);
    const currentVersion = pumpReportWorkflowVersion(current);
    const candidateVersion = pumpReportWorkflowVersion(report);

    // Approved reports are immutable unless an Admin either corrects their
    // business date or explicitly returns them to the accountant for a full
    // correction workflow. A stale device must never downgrade approval.
    if (current.status === "approved") {
      if (report.status === "approved" && current.date !== report.date) {
        const correctionMs = Date.parse(String(report.dateCorrectedAt ?? ""));
        if (
          actorRole !== "admin" ||
          !Number.isFinite(correctionMs) ||
          (correctionMs <= currentActivity && candidateVersion <= currentVersion)
        ) {
          return;
        }
      } else if (report.status !== "approved") {
        const returnedAt = Date.parse(String(report.adminReturnedAt ?? ""));
        if (
          actorRole !== "admin" ||
          report.status !== "pending_accountant" ||
          (!Number.isFinite(returnedAt) ||
            (returnedAt <= currentActivity && candidateVersion <= currentVersion))
        ) {
          return;
        }
      }
    }

    // Use the explicit workflow revision before wall-clock timestamps. Mobile
    // devices can have different clocks, but a valid transition must still
    // advance the record instead of being discarded as stale.
    if (candidateVersion !== currentVersion) {
      if (candidateVersion > currentVersion) merged.set(id, report);
      return;
    }

    const currentRank = PUMP_REPORT_STATUS_RANK[String(current.status ?? "")] ?? 0;
    const candidateRank = PUMP_REPORT_STATUS_RANK[String(report.status ?? "")] ?? 0;

    if (
      candidateActivity > currentActivity ||
      (candidateActivity === currentActivity && candidateRank >= currentRank)
    ) {
      merged.set(id, report);
    }
  };

  if (Array.isArray(existing)) existing.forEach(add);
  if (Array.isArray(incoming)) incoming.forEach(add);
  return Array.from(merged.values());
}

function canMutatePumpReport(
  current: JsonRecord | undefined,
  candidate: JsonRecord,
  auth: { username: string; empName?: string; role: string; branchId?: string | null },
): boolean {
  const isSubmittingAttendant = candidate.submittedBy === auth.username
    || (!!auth.empName && candidate.submittedBy === auth.empName);
  if (auth.role === "admin") return true;
  if (!current) {
    return auth.role === "att"
      && candidate.status === "pending_manager"
      && isSubmittingAttendant
      && (!auth.branchId || candidate.branchId === auth.branchId);
  }
  // JSONB may return object keys in a different order from the request body,
  // so compare the records structurally rather than by JSON serialization.
  if (isDeepStrictEqual(current, candidate)) return true;

  // A complete state sync normally includes reports from every workflow
  // participant. If this device has an older copy of a report that has since
  // advanced elsewhere, let the merge discard that copy instead of rejecting
  // the entire sync. Any candidate that the merge would select still has to
  // pass the role-specific transition checks below.
  if (mergePumpDailyReports([current], [candidate], auth.role)[0] === current) {
    return true;
  }

  const from = String(current.status ?? "");
  const to = String(candidate.status ?? "");
  const sameBranch = !auth.branchId || candidate.branchId === auth.branchId;
  if (auth.role === "att") {
    return isSubmittingAttendant
      && from === "returned_attendant"
      && (to === "returned_attendant" || to === "pending_manager");
  }
  if (auth.role === "mgr" && sameBranch) {
    return (
      (from === "pending_manager" && (to === "pending_accountant" || to === "returned_attendant")) ||
      (from === "returned" && (to === "pending_accountant" || to === "returned_attendant"))
    );
  }
  return auth.role === "acc"
    && from === "pending_accountant"
    && (to === "approved" || to === "returned");
}

function dipActivityMs(dip: JsonRecord): number {
  const timestamps = ["submittedAt", "approvedDt"]
    .map(key => Date.parse(String(dip[key] ?? "")))
    .filter(value => Number.isFinite(value));
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

/**
 * Tank dips are shared workflow records. A client PUT contains its complete
 * local array, so replacing the server array would let an older device erase
 * a dip submitted on another device. Merge by ID and keep the latest workflow
 * version, with terminal approval/rejection states protected from stale
 * pending copies.
 */
function mergeDips(existing: unknown, incoming: unknown): JsonRecord[] {
  const merged = new Map<string, JsonRecord>();

  const add = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const dip = value as JsonRecord;
    const id = String(dip.id ?? "");
    if (!id) return;

    const current = merged.get(id);
    if (!current) {
      merged.set(id, dip);
      return;
    }

    const currentActivity = dipActivityMs(current);
    const candidateActivity = dipActivityMs(dip);
    const currentRank = DIP_STATUS_RANK[String(current.status ?? "")] ?? 0;
    const candidateRank = DIP_STATUS_RANK[String(dip.status ?? "")] ?? 0;

    if (
      candidateRank > currentRank ||
      (candidateRank === currentRank && candidateActivity >= currentActivity)
    ) {
      merged.set(id, dip);
    }
  };

  if (Array.isArray(existing)) existing.forEach(add);
  if (Array.isArray(incoming)) incoming.forEach(add);
  return Array.from(merged.values());
}

/**
 * Asset configuration is also written as a complete array by each client.
 * Preserve an existing branch assignment when an older client sends the same
 * asset without one; explicit branch assignments from newer clients still win.
 */
function mergeAssetBranchAssignments(existing: unknown, incoming: unknown): JsonRecord[] {
  const existingById = new Map<string, JsonRecord>();
  if (Array.isArray(existing)) {
    for (const value of existing) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const asset = value as JsonRecord;
      const id = String(asset.id ?? "");
      if (id) existingById.set(id, asset);
    }
  }

  if (!Array.isArray(incoming)) return Array.from(existingById.values());
  return incoming.flatMap(value => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const asset = value as JsonRecord;
    const id = String(asset.id ?? "");
    if (!id) return [];
    const previous = existingById.get(id);
    return [{
      ...asset,
      ...(asset.branchId === undefined && previous?.branchId !== undefined
        ? { branchId: previous.branchId }
        : {}),
    }];
  });
}

function myFolderFileActivityMs(file: JsonRecord): number {
  const timestamps = ["uploadedAt", "deletedAt", "expiryReminderSentAt"]
    .map(key => Date.parse(String(file[key] ?? "")))
    .filter(value => Number.isFinite(value));
  return timestamps.length > 0 ? Math.max(...timestamps) : 0;
}

/**
 * My Folder is shared between many devices. Each client sends its complete
 * local file array, so replacing the server array would let an older device
 * erase a document uploaded by somebody else. Merge by file ID and keep the
 * newest upload/delete event for each file.
 */
function mergeMyFolderFiles(existing: unknown, incoming: unknown): JsonRecord[] {
  const merged = new Map<string, JsonRecord>();

  const add = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const file = value as JsonRecord;
    const id = String(file.id ?? "");
    if (!id) return;

    const current = merged.get(id);
    if (!current || myFolderFileActivityMs(file) >= myFolderFileActivityMs(current)) {
      merged.set(id, file);
    }
  };

  if (Array.isArray(existing)) existing.forEach(add);
  if (Array.isArray(incoming)) incoming.forEach(add);
  return Array.from(merged.values());
}

function mergeMyFolders(existing: unknown, incoming: unknown): JsonRecord[] {
  const merged = new Map<string, JsonRecord>();

  const add = (value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    const folder = value as JsonRecord;
    const id = String(folder.id ?? "");
    if (!id) return;

    const current = merged.get(id);
    if (!current || Date.parse(String(folder.createdAt ?? "")) >= Date.parse(String(current.createdAt ?? ""))) {
      merged.set(id, folder);
    }
  };

  if (Array.isArray(existing)) existing.forEach(add);
  if (Array.isArray(incoming)) incoming.forEach(add);
  return Array.from(merged.values());
}

/**
 * Chats are shared records written as one object keyed by conversation. Merge
 * each conversation by message ID so a stale device cannot remove messages,
 * read state, or archive state created on another device.
 */
function mergeMessages(existing: unknown, incoming: unknown): JsonRecord {
  const existingConversations = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as JsonRecord
    : {};
  const incomingConversations = incoming && typeof incoming === "object" && !Array.isArray(incoming)
    ? incoming as JsonRecord
    : {};
  const merged: JsonRecord = {};

  for (const key of new Set([...Object.keys(existingConversations), ...Object.keys(incomingConversations)])) {
    const byId = new Map<string, JsonRecord>();
    const add = (value: unknown) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const message = value as JsonRecord;
      const id = String(message.id ?? "");
      if (!id) return;
      const current = byId.get(id);
      if (!current) {
        byId.set(id, message);
        return;
      }
      const archivedBy = Array.from(new Set([
        ...(Array.isArray(current.archivedBy) ? current.archivedBy : []),
        ...(Array.isArray(message.archivedBy) ? message.archivedBy : []),
      ]));
      const archiveState: JsonRecord = {};
      for (const source of [current.archiveState, message.archiveState]) {
        if (!source || typeof source !== "object" || Array.isArray(source)) continue;
        for (const [username, value] of Object.entries(source as JsonRecord)) {
          if (!value || typeof value !== "object" || Array.isArray(value)) continue;
          const candidate = value as JsonRecord;
          const saved = archiveState[username] as JsonRecord | undefined;
          const candidateTime = Date.parse(String(candidate.updatedAt ?? "")) || 0;
          const savedTime = Date.parse(String(saved?.updatedAt ?? "")) || 0;
          if (!saved || candidateTime >= savedTime) archiveState[username] = candidate;
        }
      }
      byId.set(id, {
        ...current,
        read: Boolean(current.read) || Boolean(message.read),
        ...(archivedBy.length > 0 ? { archivedBy } : {}),
        ...(Object.keys(archiveState).length > 0 ? { archiveState } : {}),
      });
    };

    const existingMessages = existingConversations[key];
    const incomingMessages = incomingConversations[key];
    if (Array.isArray(existingMessages)) existingMessages.forEach(add);
    if (Array.isArray(incomingMessages)) incomingMessages.forEach(add);
    merged[key] = Array.from(byId.values()).sort((a, b) => {
      const aActivity = Date.parse(String(a.createdAt ?? "")) || Number(a.id) || 0;
      const bActivity = Date.parse(String(b.createdAt ?? "")) || Number(b.id) || 0;
      return aActivity - bActivity;
    });
  }

  return merged;
}

type ChatIdentity = { values: Set<string> };

async function resolveChatIdentity(username: string, role?: string): Promise<ChatIdentity> {
  const [staffUser] = await db
    .select({ username: staffUsersTable.username, empName: staffUsersTable.empName, role: staffUsersTable.role })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.username, username));
  return {
    values: new Set([username, staffUser?.empName, role ?? staffUser?.role]
      .filter((value): value is string => typeof value === "string" && value.length > 0)),
  };
}

function isChatParticipant(message: unknown, identity: ChatIdentity): boolean {
  if (!message || typeof message !== "object" || Array.isArray(message)) return false;
  const entry = message as JsonRecord;
  return identity.values.has(String(entry.from ?? "")) || identity.values.has(String(entry.to ?? ""));
}

function messagesForIdentity(data: unknown, identity: ChatIdentity): JsonRecord {
  if (!data || typeof data !== "object" || Array.isArray(data)) return {};
  return Object.fromEntries(Object.entries(data as JsonRecord).flatMap(([key, messages]) => {
    if (!Array.isArray(messages)) return [];
    const visibleMessages = messages.filter(message => isChatParticipant(message, identity));
    return visibleMessages.length > 0 ? [[key, visibleMessages]] : [];
  }));
}

function validateIncomingMessages(data: unknown, existing: unknown, identity: ChatIdentity): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "Messages must be conversation records";
  const existingConversations = existing && typeof existing === "object" && !Array.isArray(existing)
    ? existing as JsonRecord
    : {};
  for (const [key, entries] of Object.entries(data as JsonRecord)) {
    if (!Array.isArray(entries)) return "Each conversation must contain a message list";
    const existingMessages = new Map(
      Array.isArray(existingConversations[key])
        ? (existingConversations[key] as JsonRecord[]).map(message => [String(message.id ?? ""), message])
        : [],
    );
    for (const message of entries) {
      if (!message || typeof message !== "object" || Array.isArray(message)) return "Invalid message record";
      const entry = message as JsonRecord;
      if (!isChatParticipant(entry, identity)) return "You can only write conversations you participate in";
      const from = String(entry.from ?? "");
      const to = String(entry.to ?? "");
      if (!from || !to || key !== [from, to].sort().join("-")) {
        return "Messages must remain in their matching conversation";
      }
      const existingMessage = existingMessages.get(String(entry.id ?? ""));
      const isNewMessage = !existingMessage;
      if (isNewMessage && !identity.values.has(String(entry.from ?? ""))) {
        return "New messages must be sent by the authenticated user";
      }
      if (existingMessage) {
        for (const field of ["from", "to", "type", "body", "ts", "createdAt", "req", "alrt", "media", "call"]) {
          if (JSON.stringify(entry[field]) !== JSON.stringify(existingMessage[field])) {
            return "Existing message content cannot be changed";
          }
        }
      }
    }
  }
  return null;
}

async function resolveManagerBranchId(username?: string): Promise<string | undefined> {
  if (!username) return undefined;
  const [manager] = await db
    .select({ branchId: staffUsersTable.branchId })
    .from(staffUsersTable)
    .where(eq(staffUsersTable.username, username));
  return manager?.branchId ?? undefined;
}

/**
 * Tank dips use direct quantities: litres for petroleum and kilograms for LPG.
 * Validate on the API as well as in the mobile form so another client cannot
 * reintroduce millimetre readings or values above tank capacity.
 */
async function validateDipPayload(data: unknown): Promise<string | null> {
  if (!Array.isArray(data)) return "Tank dips must be an array";

  const [tanksRow, lpgTanksRow] = await Promise.all([
    db.select().from(appStateTable).where(eq(appStateTable.key, "tanks")),
    db.select().from(appStateTable).where(eq(appStateTable.key, "lpgTanks")),
  ]);
  const petrolCaps = new Map<string, number>();
  const lpgCaps = new Map<string, number>();

  const addCaps = (row: typeof tanksRow[number] | undefined, target: Map<string, number>) => {
    if (!row || !Array.isArray(row.data)) return;
    for (const value of row.data) {
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      const record = value as JsonRecord;
      const id = String(record.id ?? "");
      const cap = Number(record.cap);
      if (id && Number.isFinite(cap) && cap > 0) target.set(id, cap);
    }
  };
  addCaps(tanksRow[0], petrolCaps);
  addCaps(lpgTanksRow[0], lpgCaps);

  const validateReadings = (
    record: JsonRecord,
    field: "rd" | "lpg",
    caps: Map<string, number>,
    unit: "L" | "kg",
  ): string | null => {
    const readings = record[field];
    if (readings === undefined) return null;
    if (!readings || typeof readings !== "object" || Array.isArray(readings)) {
      return `${field} readings must be an object`;
    }
    for (const [tankId, rawValue] of Object.entries(readings as JsonRecord)) {
      const value = rawValue;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        return `${field} reading for ${tankId} must be a non-negative number in ${unit}`;
      }
      const cap = caps.get(tankId);
      if (cap !== undefined && value > cap) {
        return `${field} reading for ${tankId} exceeds tank capacity of ${cap} ${unit}`;
      }
    }
    return null;
  };

  for (let index = 0; index < data.length; index += 1) {
    const value = data[index];
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return `Tank dip ${index + 1} must be an object`;
    }
    const record = value as JsonRecord;
    const petrolError = validateReadings(record, "rd", petrolCaps, "L");
    if (petrolError) return `Tank dip ${index + 1}: ${petrolError}`;
    const lpgError = validateReadings(record, "lpg", lpgCaps, "kg");
    if (lpgError) return `Tank dip ${index + 1}: ${lpgError}`;
  }
  return null;
}

router.get("/state", async (req, res): Promise<void> => {
  const [rows, durableReports] = await Promise.all([
    db.select().from(appStateTable),
    db.select().from(pumpReportsTable),
  ]);
  const result: Record<string, unknown> = {};
  const deletedPumpReportIds = pumpReportDeletionIds(
    rows.find(row => row.key === PUMP_REPORT_DELETIONS_KEY)?.data,
  );
  const chatIdentity = req.auth ? await resolveChatIdentity(req.auth.username, req.auth.role) : null;
  for (const row of rows) {
    if (row.key === PUMP_REPORT_DELETIONS_KEY || row.key === COMPANY_ASSET_DELETIONS_KEY) continue;
    result[row.key] = row.key === "maintenance" && Array.isArray(row.data)
      ? row.data.map(value => (
          value && typeof value === "object" && !Array.isArray(value)
            ? normalizeMaintenanceRecord(value as JsonRecord)
            : value
        ))
      : row.key === "messages" && chatIdentity
      ? messagesForIdentity(row.data, chatIdentity)
      : visibleMyFolderState(row.key, row.data, req.auth?.role);
  }
  result.companyAssetDeletedIds = Array.from(deletedCompanyAssetIds(
    rows.find(row => row.key === COMPANY_ASSET_DELETIONS_KEY)?.data,
  ));
  if (durableReports.length > 0 || Array.isArray(result.pumpDailyReports)) {
    result.pumpDailyReports = mergePumpDailyReports(
      result.pumpDailyReports,
      durableReports
        .filter(row => !deletedPumpReportIds.has(row.id))
        .map(row => row.data),
      req.auth?.role,
    ).filter(report => !deletedPumpReportIds.has(String(report.id ?? "")));
  }
  res.json(result);
});

router.post("/pump-reports", async (req, res): Promise<void> => {
  const report = req.body?.report as JsonRecord | undefined;
  const id = String(report?.id ?? "");
  const idempotencyKey = String(req.body?.idempotencyKey ?? report?.id ?? "").trim();
  const numericFields = [
    "openingMeter", "closingMeter", "liters", "unitPrice", "grossAmount",
    "posAmount", "cashAmount", "transferAmount", "creditAmount", "totalCollected", "variance",
  ];
  if (
    !report ||
    !id ||
    !idempotencyKey ||
    idempotencyKey !== id ||
    report.status !== "pending_manager" ||
    typeof report.date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(report.date) ||
    numericFields.some(field => !Number.isFinite(Number(report[field]))) ||
    Number(report.closingMeter) <= Number(report.openingMeter) ||
    Number(report.liters) <= 0
  ) {
    res.status(400).json({ error: "A valid pending manager report is required" });
    return;
  }
  const authEmpName = req.auth?.empName ?? (
    req.auth
      ? await db.select({ empName: staffUsersTable.empName })
        .from(staffUsersTable)
        .where(eq(staffUsersTable.username, req.auth.username))
        .then(rows => rows[0]?.empName)
      : undefined
  );
  if (
    !req.auth ||
    (req.auth.role !== "att" && req.auth.role !== "admin") ||
    (req.auth.role === "att" && (
      (report.submittedBy !== req.auth.username && report.submittedBy !== authEmpName) ||
      (!!req.auth.branchId && report.branchId !== req.auth.branchId)
    ))
  ) {
    res.status(403).json({ error: "This account cannot submit that report" });
    return;
  }
  const reportForPersistence = { ...report };
  delete reportForPersistence.deliveryStatus;
  const saved = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:pump-reports'))`);
    const [existingRow] = await tx.select().from(appStateTable)
      .where(eq(appStateTable.key, "pumpDailyReports"));
    const merged = mergePumpDailyReports(existingRow?.data, [reportForPersistence], req.auth?.role);
    const canonical = merged.find(candidate => String(candidate.id) === id) ?? reportForPersistence;
    await tx.insert(pumpReportsTable).values({
      id,
      status: String(canonical.status ?? "pending_manager"),
      branchId: canonical.branchId ? String(canonical.branchId) : null,
      data: canonical,
    }).onConflictDoUpdate({
      target: pumpReportsTable.id,
      set: {
        status: String(canonical.status ?? "pending_manager"),
        branchId: canonical.branchId ? String(canonical.branchId) : null,
        data: canonical,
        updatedAt: new Date(),
      },
    });
    await tx.insert(appStateTable).values({ key: "pumpDailyReports", data: merged })
      .onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: merged, updatedAt: new Date() },
      });
    return canonical;
  });
  broadcastRealtime({ type: "pump-report.changed", reportId: id, branchId: saved.branchId ?? null });
  res.status(201).json({ ok: true, idempotencyKey, report: saved });
});

/**
 * Admin-only: seed pump meters from the most recent shift reports, then clear all
 * operational data. This is the safe production reset path that preserves the
 * current pump opening meters while wiping test transactions.
 *
 * Must be defined BEFORE /state/:key so it is not swallowed by the generic route.
 */
router.post("/state/reset-operational", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const rows = await db
    .select()
    .from(appStateTable)
    .where(sql`${appStateTable.key} IN (${[
      "pumpDailyReports",
      "pumpInitialMeters",
      "pumpLockedMeters",
      "pumps",
      "audit",
    ]})`);

  const state = Object.fromEntries(rows.map((r) => [r.key, r.data]));

  const pumpDailyReports = Array.isArray(state.pumpDailyReports) ? state.pumpDailyReports : [];
  const pumpInitialMeters =
    state.pumpInitialMeters && typeof state.pumpInitialMeters === "object"
      ? (state.pumpInitialMeters as Record<string, number>)
      : {};
  const pumpLockedMeters =
    state.pumpLockedMeters && typeof state.pumpLockedMeters === "object"
      ? (state.pumpLockedMeters as Record<string, number>)
      : {};
  const pumps = Array.isArray(state.pumps) ? state.pumps : [];
  const audit = Array.isArray(state.audit) ? state.audit : [];

  const seedMeters: Record<string, number> = {};
  for (const pump of pumps) {
    if (!pump?.id) continue;
    const pumpId = pump.id as string;
    const sorted = [...pumpDailyReports]
      .filter(
        (r: any) =>
          r.pumpId === pumpId &&
          (r.status === "approved" || r.status === "pending_accountant"),
      )
      .sort(
        (a: any, b: any) =>
          String(b.date ?? "").localeCompare(String(a.date ?? "")) ||
          pumpReportActivityMs(b) - pumpReportActivityMs(a) ||
          Number(b.id ?? 0) - Number(a.id ?? 0),
      );
    if (sorted.length > 0) {
      seedMeters[pumpId] = Number(sorted[0].closingMeter);
      continue;
    }
      if (pumpLockedMeters[pumpId] !== undefined) {
        seedMeters[pumpId] = Number(pumpLockedMeters[pumpId]);
        continue;
      }
    if (pumpInitialMeters[pumpId] !== undefined) {
      seedMeters[pumpId] = Number(pumpInitialMeters[pumpId]);
    }
  }

  const auditEntry = {
    id: Math.floor(Math.random() * 1_000_000_000),
    action: "Operational data seeded and reset",
    user: req.auth.username,
    detail: `Preserved pump opening meters from ${pumpDailyReports.length} shift reports; cleared operational data for real-life entry.`,
    ts: new Date().toISOString(),
  };
  const newAudit = [auditEntry, ...audit];

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:pump-reports'))`);
    await tx.delete(pumpReportsTable);
    await tx
      .insert(appStateTable)
      .values({ key: "pumpInitialMeters", data: seedMeters })
      .onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: seedMeters, updatedAt: new Date() },
      });

    await tx
      .insert(appStateTable)
      .values({ key: "pumpLockedMeters", data: {} })
      .onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: {}, updatedAt: new Date() },
      });

    for (const key of OPERATIONAL_KEYS) {
      const emptyValue = key === "messages" ? {} : [];
      await tx
        .insert(appStateTable)
        .values({ key, data: emptyValue })
        .onConflictDoUpdate({
          target: appStateTable.key,
          set: { data: emptyValue, updatedAt: new Date() },
        });
    }

    await tx
      .insert(appStateTable)
      .values({ key: "audit", data: newAudit })
      .onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: newAudit, updatedAt: new Date() },
      });
  });

  res.json({ ok: true, seedMeters });
});

/**
 * Native device validation creates one report with a unique marker in its
 * note. Cleanup is deliberately narrower than the normal Admin deletion
 * route: it requires the exact marker and the exact fixture submitter, and
 * records tombstones so a stale offline outbox cannot recreate the report.
 */
router.post("/state/pump-reports/cleanup-fixture", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const reportMarker = req.body?.reportMarker;
  const submittedBy = req.body?.submittedBy;
  if (
    typeof reportMarker !== "string" ||
    !reportMarker.trim() ||
    typeof submittedBy !== "string" ||
    !submittedBy.trim()
  ) {
    res.status(400).json({ error: "reportMarker and submittedBy are required" });
    return;
  }

  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:pump-reports'))`);
    const [stateRow] = await tx.select().from(appStateTable)
      .where(eq(appStateTable.key, "pumpDailyReports"));
    const durableReports = await tx.select().from(pumpReportsTable);
    const stateReports = Array.isArray(stateRow?.data)
      ? stateRow.data.filter(value => value && typeof value === "object" && !Array.isArray(value)) as JsonRecord[]
      : [];
    const matchingIds = new Set<string>();

    for (const report of [...stateReports, ...durableReports.map(row => row.data)]) {
      if (
        report &&
        typeof report === "object" &&
        !Array.isArray(report) &&
        (report as JsonRecord).note === reportMarker &&
        (report as JsonRecord).submittedBy === submittedBy
      ) {
        const id = String((report as JsonRecord).id ?? "").trim();
        if (id) matchingIds.add(id);
      }
    }

    if (matchingIds.size === 0) return { deleted: 0 };

    const deletedIds = [...matchingIds];
    const nextReports = stateReports.filter(report => !matchingIds.has(String(report.id ?? "")));
    if (stateRow) {
      await tx.insert(appStateTable).values({ key: "pumpDailyReports", data: nextReports })
        .onConflictDoUpdate({
          target: appStateTable.key,
          set: { data: nextReports, updatedAt: new Date() },
        });
    }

    const [deletionsRow] = await tx.select().from(appStateTable)
      .where(eq(appStateTable.key, PUMP_REPORT_DELETIONS_KEY));
    const existingTombstones = Array.isArray(deletionsRow?.data) ? deletionsRow.data : [];
    const existingIds = new Set(pumpReportDeletionIds(existingTombstones));
    const newTombstones = deletedIds
      .filter(id => !existingIds.has(id))
      .map(id => ({ id, deletedAt: new Date().toISOString() }));
    if (newTombstones.length > 0) {
      await tx.insert(appStateTable).values({
        key: PUMP_REPORT_DELETIONS_KEY,
        data: [...existingTombstones, ...newTombstones],
      }).onConflictDoUpdate({
        target: appStateTable.key,
        set: {
          data: [...existingTombstones, ...newTombstones],
          updatedAt: new Date(),
        },
      });
    }
    await tx.delete(pumpReportsTable).where(inArray(pumpReportsTable.id, deletedIds));
    return { deleted: deletedIds.length };
  });

  if (result.deleted > 0) {
    broadcastRealtime({ type: "pump-report.changed", deleted: true });
  }
  res.json({ ok: true, deleted: result.deleted });
});

/**
 * An approved shift report ordinarily remains immutable. Admin may remove one
 * only when it was approved against the wrong business date so an attendant
 * can enter a clean replacement. This makes the report, sale, tank effect,
 * and opening-meter reset one server-side transaction.
 */
router.post("/state/pump-reports/:id/delete", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Only an admin can delete an approved pump report" });
    return;
  }

  const idValue = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const reportId = Number(idValue);
  if (!Number.isSafeInteger(reportId)) {
    res.status(400).json({ error: "Invalid pump report ID" });
    return;
  }

  const keys = [
    "pumpDailyReports", "sales", "tanks", "lpgTanks", "pumps",
    "pumpInitialMeters", "pumpLockedMeters", "audit",
  ];
  const rows = await db.select().from(appStateTable).where(inArray(appStateTable.key, keys));
  const state = Object.fromEntries(rows.map(row => [row.key, row.data]));
  const reports = Array.isArray(state.pumpDailyReports) ? state.pumpDailyReports as JsonRecord[] : [];
  const report = reports.find(candidate => Number(candidate.id) === reportId);
  if (!report) {
    res.status(404).json({ error: "Pump report not found" });
    return;
  }
  if (report.status !== "approved") {
    res.status(409).json({ error: "Only an approved pump report uses this delete-and-reopen action" });
    return;
  }

  const pumps = Array.isArray(state.pumps) ? state.pumps as JsonRecord[] : [];
  const pump = pumps.find(candidate => candidate.id === report.pumpId);
  const branchId = String(report.branchId ?? pump?.branchId ?? "");
  const liters = Number(report.liters ?? 0);
  const product = String(report.product ?? "");
  const pumpId = String(report.pumpId ?? "");
  const sales = Array.isArray(state.sales) ? state.sales as JsonRecord[] : [];
  const tanks = Array.isArray(state.tanks) ? state.tanks as JsonRecord[] : [];
  const lpgTanks = Array.isArray(state.lpgTanks) ? state.lpgTanks as JsonRecord[] : [];
  const initialMeters = state.pumpInitialMeters && typeof state.pumpInitialMeters === "object"
    ? { ...(state.pumpInitialMeters as Record<string, number>) }
    : {};
  const lockedMeters = state.pumpLockedMeters && typeof state.pumpLockedMeters === "object"
    ? { ...(state.pumpLockedMeters as Record<string, number>) }
    : {};
  const matchingTanks = product === "LPG"
    ? lpgTanks.filter(tank => !branchId || !tank.branchId || tank.branchId === branchId)
    : tanks.filter(tank => tank.prod === product && (!branchId || !tank.branchId || tank.branchId === branchId));
  const matchingIds = new Set(matchingTanks.map(tank => String(tank.id)));
  const share = matchingTanks.length > 0 ? liters / matchingTanks.length : 0;
  const reverseTankSales = (entries: JsonRecord[]) => entries.map(tank => matchingIds.has(String(tank.id))
    ? { ...tank, sl: Math.max(0, Number(tank.sl ?? 0) - share) }
    : tank
  );
  const nextTanks = product === "LPG" ? tanks : reverseTankSales(tanks);
  const nextLpgTanks = product === "LPG" ? reverseTankSales(lpgTanks) : lpgTanks;
  if (pumpId) {
    initialMeters[pumpId] = Number(report.openingMeter ?? 0);
    delete lockedMeters[pumpId];
  }
  const audit = Array.isArray(state.audit) ? state.audit as JsonRecord[] : [];
  const auditEntry: JsonRecord = {
    id: Math.floor(Math.random() * 1_000_000_000),
    action: "Approved pump report deleted for re-entry",
    user: req.auth.username,
    detail: `Report #${reportId} deleted after wrong-date review; ${String(report.pumpName ?? "Pump")} opening meter reset for attendant re-entry.`,
    ts: new Date().toISOString(),
  };

  await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:pump-reports'))`);
    const writeState = async (key: string, data: unknown) => {
      await tx.insert(appStateTable).values({ key, data }).onConflictDoUpdate({
        target: appStateTable.key,
        set: { data, updatedAt: new Date() },
      });
    };
    const [deletionsRow] = await tx.select().from(appStateTable)
      .where(eq(appStateTable.key, PUMP_REPORT_DELETIONS_KEY));
    const deletionTombstones = Array.isArray(deletionsRow?.data) ? deletionsRow.data : [];
    await writeState("pumpDailyReports", reports.filter(candidate => Number(candidate.id) !== reportId));
    await writeState(PUMP_REPORT_DELETIONS_KEY, [
      ...deletionTombstones,
      { id: String(reportId), deletedAt: new Date().toISOString() },
    ]);
    await writeState("sales", sales.filter(entry => Number(entry.shiftReportId) !== reportId));
    await writeState("tanks", nextTanks);
    await writeState("lpgTanks", nextLpgTanks);
    await writeState("pumpInitialMeters", initialMeters);
    await writeState("pumpLockedMeters", lockedMeters);
    await writeState("audit", [auditEntry, ...audit]);
    await tx.delete(pumpReportsTable).where(eq(pumpReportsTable.id, String(reportId)));
  });

  broadcastRealtime({ type: "pump-report.changed", reportId, deleted: true });
  res.json({ ok: true });
});

/* ── Backup routes (admin-only) ─────────────────────────────────────────── */

router.post("/state/backup", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const meta = await createBackup();
    res.json({ ok: true, backup: meta });
  } catch (err) {
    req.log.error({ err }, "Manual backup failed");
    res.status(500).json({ error: "Backup failed" });
  }
});

router.get("/state/backups", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  try {
    const backups = await listBackups();
    res.json({ backups });
  } catch (err) {
    req.log.error({ err }, "List backups failed");
    res.status(500).json({ error: "Failed to list backups" });
  }
});

router.post("/state/restore", async (req, res): Promise<void> => {
  if (req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const { objectName } = req.body ?? {};
  if (typeof objectName !== "string" || !objectName) {
    res.status(400).json({ error: "objectName is required" });
    return;
  }
  try {
    const { keysRestored } = await restoreBackup(objectName);
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:pump-reports'))`);
      const [row] = await tx.select().from(appStateTable)
        .where(eq(appStateTable.key, "pumpDailyReports"));
      const reports = Array.isArray(row?.data) ? row.data as JsonRecord[] : [];
      await tx.delete(pumpReportsTable);
      for (const report of reports) {
        const id = String(report.id ?? "");
        if (!id) continue;
        await tx.insert(pumpReportsTable).values({
          id,
          status: String(report.status ?? ""),
          branchId: report.branchId ? String(report.branchId) : null,
          data: report,
        });
      }
    });
    broadcastRealtime({ type: "pump-report.changed", restored: true });
    res.json({ ok: true, keysRestored });
  } catch (err) {
    req.log.error({ err }, "Restore failed");
    res.status(500).json({ error: "Restore failed" });
  }
});

/* ── Generic per-key state routes (must come AFTER the specific /state/* routes) ── */

router.post("/state/company-assets/upsert", async (req, res): Promise<void> => {
  if (!COMPANY_ASSET_WRITE_ROLES.has(req.auth?.role ?? "")) {
    res.status(403).json({ error: "This role is not authorized to manage company assets" });
    return;
  }
  const body = req.body && typeof req.body === "object" && !Array.isArray(req.body)
    ? req.body as JsonRecord
    : {};
  const candidate = body.asset;
  const baseRevision = body.baseRevision === null
    ? null
    : Number.isInteger(body.baseRevision) && Number(body.baseRevision) >= 0
      ? Number(body.baseRevision)
      : Number.NaN;
  const error = validateCompanyAssetsPayload([candidate]);
  if (error) {
    res.status(400).json({ error });
    return;
  }
  if (!Number.isFinite(baseRevision) && baseRevision !== null) {
    res.status(400).json({ error: "baseRevision must be a non-negative integer or null" });
    return;
  }
  const assetInput = candidate as JsonRecord;
  const id = String(assetInput.id).trim();
  const managerBranchId = req.auth?.role === "mgr" ? String(req.auth.branchId ?? "").trim() : "";
  if (
    req.auth?.role === "mgr"
    && (!managerBranchId || String(assetInput.branchId ?? "").trim() !== managerBranchId)
  ) {
    res.status(403).json({ error: "A branch manager can only manage assets in the assigned branch" });
    return;
  }
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:company-assets'))`);
    const [existingRow, deletionsRow] = await Promise.all([
      tx.select().from(appStateTable).where(eq(appStateTable.key, "companyAssets")).then(rows => rows[0]),
      tx.select().from(appStateTable).where(eq(appStateTable.key, COMPANY_ASSET_DELETIONS_KEY)).then(rows => rows[0]),
    ]);
    if (deletedCompanyAssetIds(deletionsRow?.data).has(id)) return null;
    const previous = Array.isArray(existingRow?.data)
      ? (existingRow.data as JsonRecord[]).find(asset => String(asset.id ?? "").trim() === id)
      : undefined;
    if (
      previous &&
      String(previous.branchId ?? "") !== String(assetInput.branchId ?? "")
    ) {
      return { forbidden: true as const };
    }
    const next = upsertCompanyAsset(
      existingRow?.data,
      assetInput,
      new Date().toISOString(),
      req.auth!.username,
      baseRevision,
    );
    if (next.conflict) return next;
    await tx.insert(appStateTable).values({ key: "companyAssets", data: next.assets }).onConflictDoUpdate({
      target: appStateTable.key,
      set: { data: next.assets, updatedAt: new Date() },
    });
    return next;
  });
  if (!result) {
    res.status(409).json({ error: "Deleted asset IDs cannot be reused" });
    return;
  }
  if ("forbidden" in result) {
    res.status(403).json({ error: "An asset's owning branch cannot be changed; delete it explicitly and register it again" });
    return;
  }
  if (result.conflict) {
    res.status(409).json({ error: "Asset changed on another device", assets: result.assets });
    return;
  }
  res.json({ ok: true, ...result });
});

router.post("/state/company-assets/:id/delete", async (req, res): Promise<void> => {
  if (!COMPANY_ASSET_WRITE_ROLES.has(req.auth?.role ?? "")) {
    res.status(403).json({ error: "Only approved finance leaders may delete company assets" });
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!id?.trim()) {
    res.status(400).json({ error: "Asset ID required" });
    return;
  }
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:company-assets'))`);
    const [existingRow, deletionsRow] = await Promise.all([
      tx.select().from(appStateTable).where(eq(appStateTable.key, "companyAssets")).then(rows => rows[0]),
      tx.select().from(appStateTable).where(eq(appStateTable.key, COMPANY_ASSET_DELETIONS_KEY)).then(rows => rows[0]),
    ]);
    const existingAsset = Array.isArray(existingRow?.data)
      ? (existingRow.data as JsonRecord[]).find(asset => String(asset.id ?? "").trim() === id.trim())
      : undefined;
    if (
      req.auth?.role === "mgr"
      && (!existingAsset || String(existingAsset.branchId ?? "").trim() !== String(req.auth.branchId ?? "").trim())
    ) {
      return { forbidden: true as const, assets: removeCompanyAsset(existingRow?.data, id.trim()) };
    }
    const next = removeCompanyAsset(existingRow?.data, id.trim());
    const tombstones = {
      ...(deletionsRow?.data && typeof deletionsRow.data === "object" && !Array.isArray(deletionsRow.data)
        ? deletionsRow.data as JsonRecord
        : {}),
      [id.trim()]: new Date().toISOString(),
    };
    await Promise.all([
      tx.insert(appStateTable).values({ key: "companyAssets", data: next }).onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: next, updatedAt: new Date() },
      }),
      tx.insert(appStateTable).values({ key: COMPANY_ASSET_DELETIONS_KEY, data: tombstones }).onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: tombstones, updatedAt: new Date() },
      }),
    ]);
    return { forbidden: false as const, assets: next };
  });
  if (result.forbidden) {
    res.status(403).json({ error: "A branch manager can only manage assets in the assigned branch" });
    return;
  }
  res.json({ ok: true, assets: result.assets });
});

router.get("/state/:key", async (req, res): Promise<void> => {
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  if (!ALLOWED_KEYS.has(key)) {
    res.status(400).json({ error: "Unknown state key" });
    return;
  }
  const [row] = await db.select().from(appStateTable).where(eq(appStateTable.key, key));
  if (!row) {
    res.json(null);
    return;
  }
  if (key === "messages" && req.auth) {
    res.json(messagesForIdentity(row.data, await resolveChatIdentity(req.auth.username, req.auth.role)));
    return;
  }
  res.json(visibleMyFolderState(key, row.data, req.auth?.role));
});

router.put("/state/:key", async (req, res): Promise<void> => {
  const key = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
  if (!ALLOWED_KEYS.has(key)) {
    res.status(400).json({ error: "Unknown state key" });
    return;
  }
  if (COMMAND_OWNED_WORKFLOW_KEYS.has(key)) {
    res.status(409).json({
      error: `${key} is server-authoritative; use its workflow command endpoint`,
    });
    return;
  }

  // Sensitive keys require admin role
  if (key === "companyAssets" && !COMPANY_ASSET_WRITE_ROLES.has(req.auth?.role ?? "")) {
    res.status(403).json({ error: "Only approved finance leaders may manage company assets" });
    return;
  }
  if (ADMIN_WRITE_KEYS.has(key) && req.auth?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  if ((key === "myFolders" || key === "myFolderFiles") && !MY_FOLDER_WRITE_ROLES.has(req.auth?.role ?? "")) {
    res.status(403).json({ error: "Only approved corporate users may manage My Folder" });
    return;
  }
  if (key === "maintenance") {
    res.status(403).json({ error: "Use the maintenance workflow endpoints to update maintenance tasks" });
    return;
  }
  if ((key === "prices" || key === "priceHistory") && !PRICE_WRITE_ROLES.has(req.auth?.role ?? "")) {
    res.status(403).json({ error: "Only Admin, CEO, MD, or station managers may update prices" });
    return;
  }

  let data = req.body;
  if (data === undefined || data === null) {
    res.status(400).json({ error: "Body required" });
    return;
  }
  if (key === "dips") {
    const dipError = await validateDipPayload(data);
    if (dipError) {
      res.status(400).json({ error: dipError });
      return;
    }
  }
  if (key === "priceHistory" || key === "priceProposals") {
    const priceError = key === "priceHistory"
      ? validatePriceHistoryPayload(data)
      : validatePriceProposalsPayload(data);
    if (priceError) {
      res.status(400).json({ error: priceError });
      return;
    }
  }
  if (key === "companyAssets") {
    const assetError = validateCompanyAssetsPayload(data);
    if (assetError) {
      res.status(400).json({ error: assetError });
      return;
    }
  }

  // A manager sends the full client-side state blob on every sync. Never let
  // that blob replace the network fallback or another branch's override.
  // Merge only this manager's branch into the server-authoritative prices.
  if (key === "prices" && req.auth?.role === "mgr") {
    const managerBranchId = req.auth.branchId ?? await resolveManagerBranchId(req.auth.username);
    if (!managerBranchId) {
      res.status(403).json({ error: "A branch assignment is required to update prices" });
      return;
    }
    const [existingRow] = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, "prices"));
    const existing = existingRow?.data && typeof existingRow.data === "object"
      ? existingRow.data as Record<string, unknown>
      : {};
    const incoming = typeof data === "object" ? data as Record<string, unknown> : {};
    const existingBranchPrices = existing.branchPrices && typeof existing.branchPrices === "object"
      ? existing.branchPrices as Record<string, unknown>
      : {};
    const incomingBranchPrices = incoming.branchPrices && typeof incoming.branchPrices === "object"
      ? incoming.branchPrices as Record<string, unknown>
      : {};
    const existingBranch = existingBranchPrices[managerBranchId] && typeof existingBranchPrices[managerBranchId] === "object"
      ? existingBranchPrices[managerBranchId] as Record<string, unknown>
      : {};
    const incomingBranch = incomingBranchPrices[managerBranchId] && typeof incomingBranchPrices[managerBranchId] === "object"
      ? incomingBranchPrices[managerBranchId] as Record<string, unknown>
      : {};
    data = {
      ...existing,
      branchPrices: {
        ...existingBranchPrices,
        [managerBranchId]: { ...existingBranch, ...incomingBranch },
      },
    };
  }

  // History is also a shared state blob. Preserve every other branch's
  // entries and accept only entries explicitly tagged for this manager's
  // branch.
  if (key === "priceHistory" && req.auth?.role === "mgr") {
    const managerBranchId = req.auth.branchId ?? await resolveManagerBranchId(req.auth.username);
    if (!managerBranchId) {
      res.status(403).json({ error: "A branch assignment is required to update price history" });
      return;
    }
    const [existingRow] = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, "priceHistory"));
    const existingHistory = Array.isArray(existingRow?.data) ? existingRow.data as Record<string, unknown>[] : [];
    const incomingHistory = Array.isArray(data) ? data as Record<string, unknown>[] : [];
    const incomingOwn = incomingHistory.filter(entry => entry.branchId === managerBranchId);
    const existingOtherBranches = existingHistory.filter(entry => entry.branchId !== managerBranchId);
    data = [...incomingOwn, ...existingOtherBranches];
  }

  // Reports are shared workflow records. Merge instead of replacing the full
  // array so a stale attendant/manager/accountant client cannot erase reports
  // submitted by another device between its initial sync and its next PUT.
  if (key === "pumpDailyReports" && Array.isArray(data)) {
    const authEmpName = req.auth?.empName ?? (
      req.auth
        ? await db.select({ empName: staffUsersTable.empName })
          .from(staffUsersTable)
          .where(eq(staffUsersTable.username, req.auth.username))
          .then(rows => rows[0]?.empName)
        : undefined
    );
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:pump-reports'))`);
      const [existingRow] = await tx.select().from(appStateTable)
        .where(eq(appStateTable.key, "pumpDailyReports"));
      const [deletionsRow] = await tx.select().from(appStateTable)
        .where(eq(appStateTable.key, PUMP_REPORT_DELETIONS_KEY));
      const deletedPumpReportIds = pumpReportDeletionIds(deletionsRow?.data);
      const existingReports = Array.isArray(existingRow?.data)
        ? existingRow.data as JsonRecord[]
        : [];
      const existingById = new Map(existingReports.map(report => [String(report.id ?? ""), report]));
      const rejectedReportIds: string[] = [];
      const acceptedReports = (data as unknown[]).filter(value => {
        if (!value || typeof value !== "object" || Array.isArray(value) || !req.auth) return false;
        const candidate = value as JsonRecord;
        const id = String(candidate.id ?? "");
        const accepted = canMutatePumpReport(
          existingById.get(id),
          candidate,
          { ...req.auth, empName: authEmpName },
        );
        if (!accepted && id) rejectedReportIds.push(id);
        return accepted;
      });
      const next = mergePumpDailyReports(existingRow?.data, acceptedReports, req.auth?.role)
        .filter(report => !deletedPumpReportIds.has(String(report.id ?? "")));
      for (const report of next) {
        const id = String(report.id ?? "");
        if (!id) continue;
        await tx.insert(pumpReportsTable).values({
          id,
          status: String(report.status ?? ""),
          branchId: report.branchId ? String(report.branchId) : null,
          data: report,
        }).onConflictDoUpdate({
          target: pumpReportsTable.id,
          set: {
            status: String(report.status ?? ""),
            branchId: report.branchId ? String(report.branchId) : null,
            data: report,
            updatedAt: new Date(),
          },
        });
      }
      await tx.insert(appStateTable).values({ key, data: next }).onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: next, updatedAt: new Date() },
      });
      return { reports: next, rejectedReportIds };
    });
    broadcastRealtime({ type: "pump-report.changed" });
    res.json({
      ok: result.rejectedReportIds.length === 0,
      reports: result.reports,
      rejectedReportIds: result.rejectedReportIds,
    });
    return;
  }

  // Tank dips are shared workflow records. Merge instead of replacing the
  // complete array so a stale device cannot erase a dip submitted elsewhere.
  if (key === "dips" && Array.isArray(data)) {
    const [existingRow] = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, "dips"));
    data = mergeDips(existingRow?.data, data);
  }

  if (key === "budgets" && Array.isArray(data)) {
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:budgets'))`);
      const [existingRow] = await tx
        .select()
        .from(appStateTable)
        .where(eq(appStateTable.key, "budgets"));
      const current = Array.isArray(existingRow?.data) ? existingRow.data as JsonRecord[] : [];
      const currentById = new Map(current.map(budget => [String(budget.id ?? ""), budget]));
      const invalidArchive = (data as unknown[]).some(value => {
        if (!value || typeof value !== "object" || Array.isArray(value)) return true;
        const candidate = value as JsonRecord;
        const previous = currentById.get(String(candidate.id ?? ""));
        const introducesArchive = Boolean(candidate.archivedAt)
          && candidate.archivedAt !== previous?.archivedAt;
        if (!introducesArchive) return false;
        return (
          (req.auth?.role !== "acc" && req.auth?.role !== "admin")
          || !["draft", "fully_approved", "rejected"].includes(String(candidate.status ?? ""))
        );
      });
      if (invalidArchive) return { error: "Only accountants may archive completed, rejected, or draft budgets" as const };
      const merged = mergeBudgets(existingRow?.data, data);
      await tx.insert(appStateTable).values({ key, data: merged }).onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: merged, updatedAt: new Date() },
      });
      return { budgets: merged };
    });
    if ("error" in result) {
      res.status(403).json({ error: result.error });
      return;
    }
    data = result.budgets;
    res.json({ ok: true });
    return;
  }

  // Action items are shared workflow records. Merge by stable ID so a stale
  // client cannot erase another user's item, and keep closed archive records
  // immutable across later full-blob synchronisations.
  if (key === "actionItems" && Array.isArray(data)) {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:action-items'))`);
      const [existingRow] = await tx
        .select()
        .from(appStateTable)
        .where(eq(appStateTable.key, "actionItems"));
      const merged = mergeActionItems(existingRow?.data, data);
      await tx.insert(appStateTable).values({ key, data: merged }).onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: merged, updatedAt: new Date() },
      });
      data = merged;
    });
    res.json({ ok: true });
    return;
  }

  // Asset snapshots come from multiple app versions and devices. Preserve
  // every registered ID unless an authorized user uses the explicit delete
  // endpoint, and ignore older copies of records updated by another device.
  if (key === "companyAssets") {
    const assets = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:company-assets'))`);
      const [existingRow, deletionsRow] = await Promise.all([
        tx.select().from(appStateTable).where(eq(appStateTable.key, "companyAssets")).then(rows => rows[0]),
        tx.select().from(appStateTable).where(eq(appStateTable.key, COMPANY_ASSET_DELETIONS_KEY)).then(rows => rows[0]),
      ]);
      if (req.auth?.role === "mgr") {
        const managerBranchId = String(req.auth.branchId ?? "").trim();
        if (!managerBranchId) {
          return { error: "A branch assignment is required to update company assets" as const };
        }
        const existingAssets = Array.isArray(existingRow?.data)
          ? existingRow.data as JsonRecord[]
          : [];
        const existingById = new Map(existingAssets.map(asset => [String(asset.id ?? "").trim(), asset]));
        const unauthorized = (data as unknown[]).some(value => {
          if (!value || typeof value !== "object" || Array.isArray(value)) return true;
          const candidate = value as JsonRecord;
          const id = String(candidate.id ?? "").trim();
          const previous = existingById.get(id);
          const candidateBranchId = String(candidate.branchId ?? "").trim();
          // Managers receive a network snapshot, so unchanged records owned by
          // another branch are expected. Any foreign create or changed foreign
          // record must still be rejected.
          return previous
            ? (
                String(previous.branchId ?? "").trim() !== managerBranchId
                && !isDeepStrictEqual(previous, candidate)
              )
            : candidateBranchId !== managerBranchId;
        });
        if (unauthorized) {
          return { error: "A branch manager can only manage assets in the assigned branch" as const };
        }
      }
      const merged = mergeCompanyAssets(
        existingRow?.data,
        data,
        deletedCompanyAssetIds(deletionsRow?.data),
      );
      await tx.insert(appStateTable).values({ key, data: merged }).onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: merged, updatedAt: new Date() },
      });
      return merged;
    });
    if ("error" in assets) {
      res.status(403).json({ error: assets.error });
      return;
    }
    res.json({ ok: true, assets });
    return;
  }

  if (key === "messages") {
    const identity = await resolveChatIdentity(req.auth!.username, req.auth!.role);
    await db.transaction(async tx => {
      // A transaction-scoped advisory lock serializes conversation merges even
      // when the messages row is being created for the first time.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:messages'))`);
      const [existingRow] = await tx
        .select()
        .from(appStateTable)
        .where(eq(appStateTable.key, "messages"));
      const error = validateIncomingMessages(data, existingRow?.data, identity);
      if (error) throw new Error(error);
      const merged = mergeMessages(existingRow?.data, data);
      await tx.insert(appStateTable).values({ key, data: merged }).onConflictDoUpdate({
        target: appStateTable.key,
        set: { data: merged, updatedAt: new Date() },
      });
    }).catch(error => {
      res.status(403).json({ error: error instanceof Error ? error.message : "Unable to save messages" });
    });
    if (res.headersSent) return;
    res.json({ ok: true });
    return;
  }

  if ((key === "tanks" || key === "lpgTanks" || key === "pumps") && Array.isArray(data)) {
    const [existingRow] = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, key));
    data = mergeAssetBranchAssignments(existingRow?.data, data);
  }

  // My Folder is also a shared array written by every device. Merge by ID so
  // a stale client cannot erase a file uploaded by another user. Deletions
  // arrive as newer tombstone records and therefore remain synchronized. This
  // shares the expiry-reminder worker's advisory lock, preventing either path
  // from replacing the other's newer shared metadata snapshot.
  if (key === "myFolderFiles" && Array.isArray(data)) {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(7310450)`);
      const [existingRow] = await tx
        .select()
        .from(appStateTable)
        .where(eq(appStateTable.key, "myFolderFiles"));
      const merged = mergeMyFolderFiles(existingRow?.data, data);
      await tx
        .insert(appStateTable)
        .values({ key, data: merged })
        .onConflictDoUpdate({
          target: appStateTable.key,
          set: { data: merged, updatedAt: new Date() },
        });
    });
    res.json({ ok: true });
    return;
  }

  // Folder creation is shared through the same client-side array. Preserve
  // folders created by other users when an older device syncs its snapshot.
  if (key === "myFolders" && Array.isArray(data)) {
    const [existingRow] = await db
      .select()
      .from(appStateTable)
      .where(eq(appStateTable.key, "myFolders"));
    data = mergeMyFolders(existingRow?.data, data);
  }

  // Server-side cap: keep only the newest audit entries (entries are prepended),
  // so older app builds without the client-side cap can't grow the log unbounded.
  if (key === "audit" && Array.isArray(data) && data.length > 500) {
    data = data.slice(0, 500);
  }
  await db
    .insert(appStateTable)
    .values({ key, data })
    .onConflictDoUpdate({ target: appStateTable.key, set: { data, updatedAt: new Date() } });
  res.json({ ok: true });
});

export default router;
