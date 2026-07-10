# Threat Model

## Project Overview

This project is a pnpm monorepo with a publicly deployed Express 5 API (`artifacts/api-server`), a production Expo/React Native client (`artifacts/petrotrack`), and shared OpenAPI, Zod, and Drizzle packages under `lib/`. The production deployment is public and autoscaled. The API persists application state in PostgreSQL through a generic `app_state` table and the mobile client treats that server state as authoritative.

Production-scoping assumptions for this repo:
- `NODE_ENV=production` in production API builds and runs.
- The mockup sandbox artifact is development-only unless future deployment wiring proves otherwise.
- Replit terminates TLS for deployed traffic.
- Because deployment visibility is public, internet attackers can reach public routes directly.

## Assets

- **User accounts and roles** — usernames, passwords, role assignments, branch assignments, and approval status. Compromise enables impersonation and administrative access.
- **Operational business data** — sales, deliveries, prices, budgets, expenses, maintenance, tasks, audit logs, and approvals. Tampering affects business integrity and decision-making.
- **HR and corporate records** — employee records, uploaded HR documents, legal matters, meeting minutes, and company files. These contain sensitive personal and business information.
- **Application state integrity** — the `app_state` table is the backing store for most application behavior. Unauthorized writes can rewrite permissions, records, and workflow outcomes at once.
- **Infrastructure secrets** — database connection material in environment variables. Exposure would compromise the full backend data store.

## Trust Boundaries

- **Internet / API boundary** — requests from browsers, mobile clients, and arbitrary internet hosts reach the public Express API. The server must authenticate and authorize every sensitive action.
- **Client / local storage boundary** — the Expo client reads and writes AsyncStorage and must treat device state as attacker-controlled.
- **API / database boundary** — the API server is trusted to access PostgreSQL through Drizzle. Any missing auth or validation at the API layer exposes the full shared state store.
- **Authenticated user / privileged user boundary** — admin and other role-based actions are present in the client. Role enforcement must happen server-side, not only in UI state.
- **Production / dev-only boundary** — `artifacts/mockup-sandbox` is normally out of production scope; `artifacts/api-server` and `artifacts/petrotrack` are production-relevant.

## Scan Anchors

- Production API entry points: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/api-server/src/index.ts`
- Shared persistence layer: `lib/db/src/index.ts`, `lib/db/src/schema/appState.ts`
- Production client auth/state logic: `artifacts/petrotrack/app/index.tsx`, `artifacts/petrotrack/context/AppContext.tsx`, `artifacts/petrotrack/lib/api.ts`
- Public API surface today: `/api/healthz`, `/api/state`, `/api/state/:key`
- Dev-only area to usually ignore: `artifacts/mockup-sandbox/**`

## Threat Categories

### Spoofing

This project currently has a public API and a client-side login flow. The system must not trust client-declared identity, locally stored sessions, or hardcoded credentials. All sensitive API routes must require a valid server-verified identity, and privileged roles must be derived from server-side state rather than UI selections or local state.

### Tampering

The application stores most business state in a generic shared key-value table and exposes write operations over HTTP. This makes state integrity a primary risk: attackers must not be able to overwrite prices, budgets, approvals, user access settings, or operational records through direct API calls or client-side role manipulation. All state-changing operations must be authorized server-side and constrained to validated schemas.

### Information Disclosure

The backend and mobile client handle HR records, company files, user account data, and operational business data. The system must prevent unauthorized reads of these datasets through public endpoints, permissive client sync, or plaintext credential storage. Sensitive fields such as passwords must never be stored or transmitted in recoverable plaintext.

### Denial of Service

The public API accepts JSON bodies and direct writes to shared state. The system must prevent unauthenticated or low-cost requests from repeatedly overwriting large state objects or forcing excessive database activity. Public endpoints need sensible authentication and request controls so internet users cannot cheaply disrupt the service.

### Elevation of Privilege

The mobile client exposes admin and role-based workflows, but those privileges are meaningful only if enforced by the server. The system must ensure that administrative capabilities cannot be reached by using built-in credentials, modifying locally stored state, or writing directly to the shared persistence endpoints. Server-side authorization must be the final authority for access-control decisions.
