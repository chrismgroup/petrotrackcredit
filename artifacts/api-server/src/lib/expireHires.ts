import { and, eq, inArray, lte } from "drizzle-orm";

import { db, charterPartiesTable, vesselsTable } from "@workspace/db";

export type ActiveCharter = {
  id: number;
  vesselId: number;
  hireEnd: Date | string | null;
};

/**
 * Pure function: given a list of active charter rows and a reference time,
 * returns only the charters whose hire period has ended.
 * Exported for unit testing without a database.
 */
export function findExpiredCharters(
  active: ActiveCharter[],
  now: Date,
): ActiveCharter[] {
  return active.filter(
    (cp) => cp.hireEnd !== null && new Date(cp.hireEnd) <= now,
  );
}

/**
 * Transitions all expired active charters to "terminated" and returns
 * their vessels to "available".
 *
 * Idempotent: the WHERE guards on both UPDATE statements (`status = 'active'`
 * and `status = 'on_hire'`) mean concurrent invocations simply find nothing
 * to update on the second pass — no double-writes occur.
 */
export async function expireHires(): Promise<void> {
  const now = new Date();

  const active = await db
    .select({
      id: charterPartiesTable.id,
      vesselId: charterPartiesTable.vesselId,
      hireEnd: charterPartiesTable.hireEnd,
    })
    .from(charterPartiesTable)
    .where(
      and(
        eq(charterPartiesTable.status, "active"),
        lte(charterPartiesTable.hireEnd, now),
      ),
    );

  if (active.length === 0) return;

  const expiredIds = active.map((cp) => cp.id);
  const vesselIds = [...new Set(active.map((cp) => cp.vesselId))];

  await db
    .update(charterPartiesTable)
    .set({ status: "terminated", updatedAt: now })
    .where(
      and(
        inArray(charterPartiesTable.id, expiredIds),
        eq(charterPartiesTable.status, "active"),
      ),
    );

  await db
    .update(vesselsTable)
    .set({ status: "available", updatedAt: now })
    .where(
      and(
        inArray(vesselsTable.id, vesselIds),
        eq(vesselsTable.status, "on_hire"),
      ),
    );
}
