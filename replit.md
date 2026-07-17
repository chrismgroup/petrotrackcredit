# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
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

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

- Production data must never be erased by code changes or redeployments. All schema changes must be additive (new columns with defaults, new tables only — never drop or rename).
- Device AsyncStorage data belongs to the user's device and is unaffected by any server-side or code change.

## Gotchas

- **NEVER run `db push` against production.** The drizzle config throws if `NODE_ENV=production` as a hard guard. Push is dev-only — it syncs the Replit workspace database only.
- **`push-force` script has been removed** — it was too dangerous. Do not re-add it.
- **Code changes do NOT touch any database.** Only `db push` (dev) or a deliberate SQL migration (production) changes the schema.
- **Production schema changes:** add columns with a `DEFAULT` so existing rows remain valid. Never drop or rename a column — add a new one and migrate data gradually.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
