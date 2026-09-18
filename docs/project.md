# Petrotrack

Petrotrack is a fuel-station operations app for managing staff, inventory, sales, and approvals.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## User preferences

- Production data must never be erased by code changes or redeployments. All schema changes must be additive (new columns with defaults, new tables only — never drop or rename).
- Device AsyncStorage data belongs to the user's device and is unaffected by any server-side or code change.

## Gotchas

- **NEVER run `db push` against production.** The drizzle config throws if `NODE_ENV=production` as a hard guard. Push is dev-only.
- **`push-force` script has been removed** — it was too dangerous. Do not re-add it.
- **Code changes do NOT touch any database.** Only `db push` (dev) or a deliberate SQL migration (production) changes the schema.
- **Production schema changes:** add columns with a `DEFAULT` so existing rows remain valid. Never drop or rename a column — add a new one and migrate data gradually.