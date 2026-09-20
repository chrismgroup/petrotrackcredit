# Render deployment

The repository deploys as two Render web services:

- `petrotrack-api` runs the Express API and uses Render Postgres.
- `petrotrack-1` serves the Expo static build and points to the API service.

Create both services and the database from the repository's `render.yaml`.
Render supplies `PORT` to each service. The API health check is
`/api/healthz`.

## Required setup

1. Create or connect a Render workspace and deploy the blueprint.
2. Set `EXPO_PUBLIC_API_URL` on `petrotrack-1` to the public URL of the
   deployed `petrotrack-api` service, for example
   `https://petrotrack-api.onrender.com`. Do not leave this unset: the web
   service cannot serve `/api` itself.
3. Create a Google Cloud Storage bucket for application files and backups.
4. Give a Google service account access to that bucket, then set these API
   service variables in Render:

   - `GCP_SERVICE_ACCOUNT_JSON`: the service account JSON as one environment
     variable. Omit it when the runtime already has Google Application Default
     Credentials.
   - `PUBLIC_OBJECT_SEARCH_PATHS`: comma-separated paths such as
     `/petrotrack-assets/public`.
   - `PRIVATE_OBJECT_DIR`: a path such as `/petrotrack-assets/private`.

5. Provision the Render database schema before first use. The repository's
   `@workspace/db push` command is intentionally blocked when
   `NODE_ENV=production`; use a reviewed SQL migration or run the schema
   provisioning command from a controlled non-production environment against
   the new database.
6. Replace `https://petrotrack-1.onrender.com/` in `app.json` if a custom
   web domain is used.

## Native builds

Render hosts the API, but iOS and Android builds still come from EAS. Set
Set `EXPO_PUBLIC_API_URL` in the EAS project environment to the deployed API URL,
for example `https://petrotrack-api.onrender.com`, before running a production
build. Existing native bundle identifiers are preserved so the current store
applications are not unintentionally replaced.

## Local verification

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/petrotrack run test:build
```