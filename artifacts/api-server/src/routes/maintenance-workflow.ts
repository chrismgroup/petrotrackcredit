import { randomUUID } from "crypto";
import { eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";

import { appStateTable, db, notificationsTable, staffUsersTable } from "@workspace/db";
import {
  MAINTENANCE_STATUSES,
  createMaintenanceTaskId,
  isAllowedMaintenanceTransition,
  isMaintenanceDecisionRole,
  type MaintenanceStatus,
} from "./maintenance-workflow-rules";

const router: IRouter = Router();

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asMaintenanceRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function displayStatus(status: MaintenanceStatus): "Open" | "Done" {
  return status === "done" || status === "closed" ? "Done" : "Open";
}

function taskLabel(taskId: unknown): string {
  return typeof taskId === "string" && taskId ? taskId : "maintenance task";
}

function historyEntry(action: string, actor: string, detail?: string): JsonRecord {
  return {
    id: randomUUID(),
    action,
    actor,
    detail: detail ?? "",
    at: new Date().toISOString(),
  };
}

function appendHistory(item: JsonRecord, entry: JsonRecord): JsonRecord {
  const history = Array.isArray(item.history) ? item.history.filter(isRecord) : [];
  return { ...item, history: [...history, entry], updatedAt: entry.at };
}

function findRecord(records: JsonRecord[], taskId: string): { index: number; item: JsonRecord } | null {
  const index = records.findIndex(item => item.taskId === taskId);
  return index >= 0 ? { index, item: records[index] } : null;
}

async function updateAudit(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], entry: JsonRecord) {
  const [auditRow] = await tx.select().from(appStateTable).where(eq(appStateTable.key, "audit"));
  const existing = Array.isArray(auditRow?.data) ? auditRow.data : [];
  await tx.insert(appStateTable).values({ key: "audit", data: [entry, ...existing].slice(0, 500) })
    .onConflictDoUpdate({
      target: appStateTable.key,
      set: { data: [entry, ...existing].slice(0, 500), updatedAt: new Date() },
    });
}

async function saveMaintenance(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], records: JsonRecord[]) {
  await tx.insert(appStateTable).values({ key: "maintenance", data: records })
    .onConflictDoUpdate({
      target: appStateTable.key,
      set: { data: records, updatedAt: new Date() },
    });
}

function notification(username: string, title: string, body: string, taskId: string) {
  return {
    username,
    type: "report_update" as const,
    title,
    body,
    data: { route: "/(app)/maintenance", taskId },
  };
}

router.get("/maintenance", async (_req, res): Promise<void> => {
  const [row] = await db.select().from(appStateTable).where(eq(appStateTable.key, "maintenance"));
  res.json(asMaintenanceRecords(row?.data));
});

router.post("/maintenance", async (req, res): Promise<void> => {
  const { title, pri, date } = req.body ?? {};
  if (typeof title !== "string" || !title.trim() || typeof date !== "string" || !date) {
    res.status(400).json({ error: "A title and maintenance date are required" });
    return;
  }
  if (!["Urgent", "Medium", "Low"].includes(pri)) {
    res.status(400).json({ error: "Priority must be Urgent, Medium, or Low" });
    return;
  }

  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:maintenance-workflow'))`);
    const [row] = await tx.select().from(appStateTable).where(eq(appStateTable.key, "maintenance"));
    const records = asMaintenanceRecords(row?.data);
    const submittedAt = new Date().toISOString();
    const taskId = createMaintenanceTaskId();
    const maxLegacyId = records.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0);
    const item = {
      id: maxLegacyId + 1,
      taskId,
      title: title.trim(),
      pri,
      date,
      by: req.auth!.username,
      submittedBy: req.auth!.username,
      submittedByName: req.auth!.username,
      submittedAt,
      status: "pending" as const,
      st: "Open" as const,
      history: [historyEntry("Request submitted", req.auth!.username)],
      updatedAt: submittedAt,
    };
    records.unshift(item);
    await saveMaintenance(tx, records);
    await updateAudit(tx, {
      id: randomUUID(),
      action: "Maintenance request submitted",
      user: req.auth!.username,
      detail: `${taskId}: ${item.title}`,
      ts: submittedAt,
    });
    return item;
  });
  res.status(201).json({ maintenance: result });
});

router.post("/maintenance/:taskId/acknowledge", async (req, res): Promise<void> => {
  if (!isMaintenanceDecisionRole(req.auth!.role)) {
    res.status(403).json({ error: "Only the MD or CEO can acknowledge maintenance requests" });
    return;
  }
  const taskId = req.params.taskId;
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:maintenance-workflow'))`);
    const [row] = await tx.select().from(appStateTable).where(eq(appStateTable.key, "maintenance"));
    const records = asMaintenanceRecords(row?.data);
    const found = findRecord(records, taskId);
    if (!found) return null;
    if (found.item.acknowledgedAt) return { duplicate: true, item: found.item };

    const now = new Date().toISOString();
    const item = appendHistory({
      ...found.item,
      acknowledgedBy: req.auth!.username,
      acknowledgedAt: now,
      receivedBy: req.auth!.username,
      receivedAt: now,
      status: found.item.status === "pending" ? "open" : found.item.status,
      st: "Open",
    }, historyEntry("Receipt acknowledged", req.auth!.username, "Acknowledgement sent to the submitter."));
    records[found.index] = item;
    await saveMaintenance(tx, records);
    const submitter = typeof item.submittedBy === "string" ? item.submittedBy : String(item.by ?? "");
    if (submitter) {
      await tx.insert(notificationsTable).values(notification(
        submitter,
        "Maintenance request received",
        `${taskLabel(item.taskId)} has been acknowledged by ${req.auth!.username}.`,
        taskId,
      ));
    }
    await updateAudit(tx, {
      id: randomUUID(),
      action: "Maintenance receipt acknowledged",
      user: req.auth!.username,
      detail: `${taskId}: acknowledgement sent to ${submitter}`,
      ts: now,
    });
    return { duplicate: false, item };
  });
  if (!result) {
    res.status(404).json({ error: "Maintenance task not found" });
    return;
  }
  res.json({ maintenance: result.item, duplicate: result.duplicate });
});

router.post("/maintenance/:taskId/assign", async (req, res): Promise<void> => {
  if (!isMaintenanceDecisionRole(req.auth!.role)) {
    res.status(403).json({ error: "Only the MD or CEO can assign maintenance tasks" });
    return;
  }
  const taskId = req.params.taskId;
  const { username } = req.body ?? {};
  if (typeof username !== "string" || !username) {
    res.status(400).json({ error: "An active staff username is required" });
    return;
  }
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:maintenance-workflow'))`);
    const [row] = await tx.select().from(appStateTable).where(eq(appStateTable.key, "maintenance"));
    const records = asMaintenanceRecords(row?.data);
    const found = findRecord(records, taskId);
    if (!found) return null;
    if (!found.item.acknowledgedAt) return { error: "Acknowledge receipt before assigning this task" };

    const [assignee] = await tx.select().from(staffUsersTable)
      .where(eq(staffUsersTable.username, username));
    if (!assignee || assignee.status !== "active") return { error: "Choose an active staff member" };

    const now = new Date().toISOString();
    const assigneeName = assignee.empName || assignee.username || username;
    const item = appendHistory({
      ...found.item,
      assignedTo: assignee.username,
      assignedToName: assigneeName,
      assignedBy: req.auth!.username,
      assignedAt: now,
      status: found.item.status === "pending" ? "open" : found.item.status,
      st: "Open",
    }, historyEntry("Task assigned", req.auth!.username, `Assigned to ${assigneeName}.`));
    records[found.index] = item;
    await saveMaintenance(tx, records);
    if (assignee.username) {
      await tx.insert(notificationsTable).values(notification(
        assignee.username,
        "Maintenance task assigned",
        `${taskLabel(item.taskId)} has been assigned to you by ${req.auth!.username}.`,
        taskId,
      ));
    }
    await updateAudit(tx, {
      id: randomUUID(),
      action: "Maintenance task assigned",
      user: req.auth!.username,
      detail: `${taskId}: assigned to ${assigneeName}`,
      ts: now,
    });
    return { item };
  });
  if (!result) {
    res.status(404).json({ error: "Maintenance task not found" });
    return;
  }
  if ("error" in result) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ maintenance: result.item });
});

router.post("/maintenance/:taskId/status", async (req, res): Promise<void> => {
  const taskId = req.params.taskId;
  const { status } = req.body ?? {};
  if (!MAINTENANCE_STATUSES.includes(status)) {
    res.status(400).json({ error: "Unsupported maintenance status" });
    return;
  }
  const result = await db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('petrotrack:maintenance-workflow'))`);
    const [row] = await tx.select().from(appStateTable).where(eq(appStateTable.key, "maintenance"));
    const records = asMaintenanceRecords(row?.data);
    const found = findRecord(records, taskId);
    if (!found) return null;
    if (found.item.assignedTo !== req.auth!.username) return { error: "Only the assigned staff member can update this task" };
    if (found.item.status === "closed") return { error: "Closed maintenance tasks cannot be updated" };
    const currentStatus = MAINTENANCE_STATUSES.includes(found.item.status as MaintenanceStatus)
      ? found.item.status as MaintenanceStatus
      : "open";
    if (!isAllowedMaintenanceTransition(currentStatus, status)) {
      return { error: `A ${currentStatus.replace(/_/g, " ")} task cannot move directly to ${String(status).replace(/_/g, " ")}` };
    }

    const now = new Date().toISOString();
    const item = appendHistory({
      ...found.item,
      status: status as MaintenanceStatus,
      st: displayStatus(status as MaintenanceStatus),
      statusUpdatedBy: req.auth!.username,
      statusUpdatedAt: now,
    }, historyEntry("Status updated", req.auth!.username, `Marked ${String(status).replace(/_/g, " ")}.`));
    records[found.index] = item;
    await saveMaintenance(tx, records);
    await updateAudit(tx, {
      id: randomUUID(),
      action: "Maintenance status updated",
      user: req.auth!.username,
      detail: `${taskId}: ${status}`,
      ts: now,
    });
    return { item };
  });
  if (!result) {
    res.status(404).json({ error: "Maintenance task not found" });
    return;
  }
  if ("error" in result) {
    res.status(403).json({ error: result.error });
    return;
  }
  res.json({ maintenance: result.item });
});

export default router;