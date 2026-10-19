import assert from "node:assert/strict";
import test from "node:test";

import { branchFromManagerName, mergeLiveIdentity, resolveLiveIdentity } from "../lib/liveIdentity";

const token = { username: "ada", empName: "Ada Obi", role: "mgr", branchId: null };
const row = (branchId: string | null, role = "mgr") => ({ username: "ada", empName: "Ada Obi", role, branchId, status: "active" });

test("the database branch replaces a stale token branch", () => {
  assert.equal(mergeLiveIdentity({ ...token, branchId: "old" }, row("new"), []).branchId, "new");
  assert.equal(mergeLiveIdentity(token, row(null, "acc"), []).role, "acc");
});

test("a manager named on exactly one branch inherits that branch", () => {
  const branches = [{ id: "b1", mgr: " ada  OBI " }, { id: "b2", mgr: "Someone Else" }];
  assert.equal(mergeLiveIdentity(token, row(null), branches).branchId, "b1");
  assert.equal(branchFromManagerName([...branches, { id: "b3", mgr: "Ada Obi" }], ["Ada Obi"]), null);
  assert.equal(mergeLiveIdentity({ ...token, role: "att" }, row(null, "att"), branches).branchId, null);
});

test("identity lookup failures keep the signed token", async () => {
  const failing = { findUser: async () => { throw new Error("db down"); }, branches: async () => [] };
  assert.deepEqual(await resolveLiveIdentity({ ...token, branchId: "b9" }, failing), { ...token, branchId: "b9" });
  assert.deepEqual(await resolveLiveIdentity(token, null), token);
  const unknown = { findUser: async () => undefined, branches: async () => [] };
  assert.deepEqual(await resolveLiveIdentity({ ...token, branchId: "b9" }, unknown), { ...token, branchId: "b9" });
});
