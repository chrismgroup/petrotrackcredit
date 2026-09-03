import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";

type LoginResult = {
  token: string;
  role: string;
  branchId: string | null;
};

type CompanyAsset = {
  id: string;
  name: string;
  branchId: string;
  revision?: number;
  [key: string]: unknown;
};

type AssetResponse = {
  ok: boolean;
  asset: CompanyAsset;
  assets: CompanyAsset[];
};

test("enforces branch asset ownership through authenticated HTTP routes", {
  skip: !process.env.DATABASE_URL || !process.env.JWT_SECRET,
  timeout: 30_000,
}, async () => {
  const [{ default: app }, { pool }] = await Promise.all([
    import("../app"),
    import("@workspace/db"),
  ]);
  const marker = `company-assets-acceptance-${randomUUID()}`;
  const password = `Test-${randomUUID()}`;
  const branchA = `${marker}-branch-a`;
  const branchB = `${marker}-branch-b`;
  const usernames = {
    manager: `${marker}-manager`,
    accountant: `${marker}-accountant`,
    admin: `${marker}-admin`,
  };
  const assetIds: string[] = [];
  const server = app.listen(0);
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}/api`;

  async function request<T>(
    path: string,
    options: RequestInit = {},
    token?: string,
  ): Promise<{ status: number; body: T }> {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    return {
      status: response.status,
      body: await response.json() as T,
    };
  }

  async function login(username: string): Promise<LoginResult> {
    const result = await request<LoginResult>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    assert.equal(result.status, 200);
    assert.equal(typeof result.body.token, "string");
    return result.body;
  }

  function asset(idSuffix: string, branchId: string, name: string): CompanyAsset {
    const id = `${marker}-${idSuffix}`;
    assetIds.push(id);
    return {
      id,
      name,
      category: "Generators",
      branchId,
      quantity: 1,
      initialCost: 1_300_000,
      endOfLifeValue: 100_000,
      usefulLifeYears: 5,
      acquiredOn: "2026-09-01",
    };
  }

  async function upsert(
    token: string,
    value: CompanyAsset,
    baseRevision: number | null,
  ): Promise<{ status: number; body: AssetResponse }> {
    return request<AssetResponse>("/state/company-assets/upsert", {
      method: "POST",
      body: JSON.stringify({ asset: value, baseRevision }),
    }, token);
  }

  try {
    await pool.query(`
      INSERT INTO staff_users (
        emp_name, username, password, role, branch_id, status,
        created_by, approved_by, approved_at
      )
      VALUES
        ('Acceptance Branch Manager', $1, $4, 'mgr', $5, 'active', $6, $6, NOW()),
        ('Acceptance Accountant', $2, $4, 'acc', NULL, 'active', $6, $6, NOW()),
        ('Acceptance Admin', $3, $4, 'admin', NULL, 'active', $6, $6, NOW())
    `, [
      usernames.manager,
      usernames.accountant,
      usernames.admin,
      password,
      branchA,
      marker,
    ]);

    const [manager, accountant, admin] = await Promise.all([
      login(usernames.manager),
      login(usernames.accountant),
      login(usernames.admin),
    ]);
    assert.equal(manager.role, "mgr");
    assert.equal(manager.branchId, branchA);
    assert.equal(accountant.role, "acc");
    assert.equal(admin.role, "admin");

    const managed = asset("managed", branchA, "Branch A Generator");
    const managerCreate = await upsert(manager.token, managed, null);
    assert.equal(managerCreate.status, 200);
    assert.equal(managerCreate.body.asset.branchId, branchA);
    assert.equal(managerCreate.body.asset.revision, 1);

    const managerEdit = await upsert(manager.token, {
      ...managerCreate.body.asset,
      name: "Branch A Main Generator",
    }, 1);
    assert.equal(managerEdit.status, 200);
    assert.equal(managerEdit.body.asset.name, "Branch A Main Generator");
    assert.equal(managerEdit.body.asset.revision, 2);

    const managerDelete = await request<{ ok: boolean; assets: CompanyAsset[] }>(
      `/state/company-assets/${encodeURIComponent(managed.id)}/delete`,
      { method: "POST", body: "{}" },
      manager.token,
    );
    assert.equal(managerDelete.status, 200);
    assert.equal(managerDelete.body.assets.some(value => value.id === managed.id), false);

    const foreignCreate = await upsert(
      manager.token,
      asset("forbidden-create", branchB, "Forbidden Branch B Generator"),
      null,
    );
    assert.equal(foreignCreate.status, 403);

    const movable = asset("forbidden-move", branchA, "Branch A Movable Generator");
    const movableCreate = await upsert(manager.token, movable, null);
    assert.equal(movableCreate.status, 200);
    const foreignMove = await upsert(manager.token, {
      ...movableCreate.body.asset,
      branchId: branchB,
    }, 1);
    assert.equal(foreignMove.status, 403);

    const foreign = asset("foreign", branchB, "Branch B Generator");
    const accountantCreate = await upsert(accountant.token, foreign, null);
    assert.equal(accountantCreate.status, 200);
    assert.equal(accountantCreate.body.asset.branchId, branchB);

    const adminEdit = await upsert(admin.token, {
      ...accountantCreate.body.asset,
      name: "Branch B Main Generator",
    }, 1);
    assert.equal(adminEdit.status, 200);
    assert.equal(adminEdit.body.asset.name, "Branch B Main Generator");

    const foreignEdit = await upsert(manager.token, {
      ...adminEdit.body.asset,
      name: "Manager Must Not Edit This",
    }, 2);
    assert.equal(foreignEdit.status, 403);

    const foreignDelete = await request<{ error: string }>(
      `/state/company-assets/${encodeURIComponent(foreign.id)}/delete`,
      { method: "POST", body: "{}" },
      manager.token,
    );
    assert.equal(foreignDelete.status, 403);

    const accountantDelete = await request<{ ok: boolean; assets: CompanyAsset[] }>(
      `/state/company-assets/${encodeURIComponent(foreign.id)}/delete`,
      { method: "POST", body: "{}" },
      accountant.token,
    );
    assert.equal(accountantDelete.status, 200);

    const staleProtected = asset("stale-protected", branchB, "Canonical Branch B Asset");
    const canonicalCreate = await upsert(admin.token, staleProtected, null);
    assert.equal(canonicalCreate.status, 200);
    const staleCopy = {
      ...staleProtected,
      name: "Stale Overwrite Attempt",
      revision: 0,
    };
    const staleWrite = await request<{ ok: boolean; assets: CompanyAsset[] }>(
      "/state/companyAssets",
      { method: "PUT", body: JSON.stringify([staleCopy]) },
      admin.token,
    );
    assert.equal(staleWrite.status, 200);
    assert.equal(
      staleWrite.body.assets.find(value => value.id === staleProtected.id)?.name,
      "Canonical Branch B Asset",
    );

    const canonicalDelete = await request<{ ok: boolean; assets: CompanyAsset[] }>(
      `/state/company-assets/${encodeURIComponent(staleProtected.id)}/delete`,
      { method: "POST", body: "{}" },
      admin.token,
    );
    assert.equal(canonicalDelete.status, 200);

    const resurrectionAttempt = await request<{ ok: boolean; assets: CompanyAsset[] }>(
      "/state/companyAssets",
      { method: "PUT", body: JSON.stringify([staleCopy]) },
      admin.token,
    );
    assert.equal(resurrectionAttempt.status, 200);
    assert.equal(
      resurrectionAttempt.body.assets.some(value => value.id === staleProtected.id),
      false,
    );

    const finalState = await request<CompanyAsset[]>("/state/companyAssets", {}, admin.token);
    assert.equal(finalState.status, 200);
    assert.equal(finalState.body.some(value => value.id === managed.id), false);
    assert.equal(finalState.body.some(value => value.id === foreign.id), false);
    assert.equal(finalState.body.some(value => value.id === staleProtected.id), false);
  } finally {
    await pool.query("BEGIN");
    try {
      await pool.query(`
        UPDATE app_state
        SET data = COALESCE((
          SELECT jsonb_agg(item)
          FROM jsonb_array_elements(data) item
          WHERE NOT (item->>'id' = ANY($1::text[]))
        ), '[]'::jsonb)
        WHERE key = 'companyAssets'
      `, [assetIds]);
      await pool.query(`
        UPDATE app_state
        SET data = COALESCE((
          SELECT jsonb_object_agg(entry.key, entry.value)
          FROM jsonb_each(data) entry
          WHERE NOT (entry.key = ANY($1::text[]))
        ), '{}'::jsonb)
        WHERE key = 'companyAssetDeletionTombstones'
      `, [assetIds]);
      await pool.query("DELETE FROM staff_users WHERE created_by = $1", [marker]);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close(error => error ? reject(error) : resolve());
      });
      await pool.end();
    }
  }
});