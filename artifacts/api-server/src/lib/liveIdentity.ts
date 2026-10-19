import type { AuthPayload } from "../middlewares/requireAuth";

/**
 * A JWT is a snapshot taken at login. Branch assignments and roles change
 * afterwards (a manager is moved to another station, or is first assigned a
 * branch after their account was created), and trusting the stale token
 * blocked those users from submitting tank dips and other branch reports
 * until they logged out. Every authenticated request therefore re-reads the
 * live identity from PostgreSQL, keeping the token only as a fallback.
 */

type BranchRecord = { id?: unknown; name?: unknown; mgr?: unknown };
type StaffRow = { username: string | null; empName: string; role: string | null; branchId: string | null; status: string };

export interface IdentitySource {
  findUser(username: string): Promise<StaffRow | undefined>;
  branches(): Promise<BranchRecord[]>;
}

const CACHE_TTL_MS = 5_000;
const cache = new Map<string, { at: number; value: AuthPayload }>();

const norm = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Branch managers are sometimes named on the branch record (Branches screen)
 * without the account's branch_id being set. Resolve that only when exactly
 * one branch names this person, so the match can never be ambiguous.
 */
export function branchFromManagerName(branches: BranchRecord[], names: Array<string | null | undefined>): string | null {
  const wanted = new Set(names.map(norm).filter(Boolean));
  if (wanted.size === 0) return null;
  const matches = branches.filter(branch => String(branch.id ?? "").trim() && wanted.has(norm(branch.mgr)));
  return matches.length === 1 ? String(matches[0].id).trim() : null;
}

export function mergeLiveIdentity(token: AuthPayload, row: StaffRow | undefined, branches: BranchRecord[]): AuthPayload {
  const live: AuthPayload = { ...token };
  if (row) {
    if (row.role) live.role = row.role;
    if (row.empName) live.empName = row.empName;
    live.branchId = row.branchId?.trim() || null;
  }
  if (!live.branchId && live.role === "mgr") {
    live.branchId = branchFromManagerName(branches, [live.empName, live.username]) ?? token.branchId ?? null;
  }
  return live;
}

let defaultSource: IdentitySource | null | undefined;
async function loadDefaultSource(): Promise<IdentitySource | null> {
  if (defaultSource !== undefined) return defaultSource;
  if (!process.env.DATABASE_URL) return (defaultSource = null);
  const [{ db, staffUsersTable, appStateTable }, { eq }] = await Promise.all([
    import("@workspace/db"),
    import("drizzle-orm"),
  ]);
  defaultSource = {
    async findUser(username) {
      const [row] = await db
        .select({
          username: staffUsersTable.username,
          empName: staffUsersTable.empName,
          role: staffUsersTable.role,
          branchId: staffUsersTable.branchId,
          status: staffUsersTable.status,
        })
        .from(staffUsersTable)
        .where(eq(staffUsersTable.username, username));
      return row;
    },
    async branches() {
      const [row] = await db.select().from(appStateTable).where(eq(appStateTable.key, "branches"));
      return Array.isArray(row?.data) ? (row.data as BranchRecord[]) : [];
    },
  };
  return defaultSource;
}

export async function resolveLiveIdentity(token: AuthPayload, source?: IdentitySource | null): Promise<AuthPayload> {
  const key = token.username;
  if (!key) return token;
  const cached = source === undefined ? cache.get(key) : undefined;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  try {
    const store = source === undefined ? await loadDefaultSource() : source;
    if (!store) return token;
    const row = await store.findUser(key);
    const needsBranches = !(row?.branchId?.trim()) && (row?.role ?? token.role) === "mgr";
    const live = mergeLiveIdentity(token, row, needsBranches ? await store.branches() : []);
    if (source === undefined) cache.set(key, { at: Date.now(), value: live });
    return live;
  } catch {
    return token;
  }
}

/** Drop a user's cached identity right after an admin changes it. */
export function invalidateLiveIdentity(username?: string | null): void {
  if (username) cache.delete(username);
  else cache.clear();
}
