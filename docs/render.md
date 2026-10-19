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
3. All app data lives in the app's own PostgreSQL database. Nothing is stored
   in Google Cloud or any other external storage, and the app keeps no
   permanent file copies on phones or browsers.
   - Uploaded files (My Folders, meeting-minute attachments, HR enrollment
     documents, HR documents and handbooks, delivery evidence and chat media)
     are stored relationally, up to 20 MB per file:
     - `stored_files`: one row per file, with name, type, size, `category`,
       `related_id` (the folder, delivery, employee or chat it belongs to),
       `branch_id`, a SHA-256 checksum and `uploaded_by_user_id`, a foreign
       key to `staff_users`.
     - `stored_file_contents`: the file bytes, keyed by `object_path` with
       `ON DELETE CASCADE`, so deleting a file removes its contents.
     - `stored_files_overview`: a view joining files to their uploader's
       name and role, for reporting and management.
   - Scheduled and manual app-state backups are stored in the
     `app_state_backups` table.
   The API creates and upgrades these tables automatically on first use (see
   `lib/db/migrations/20261021_app_state_backups.sql` and
   `lib/db/migrations/20261022_relational_file_storage.sql`), including
   moving bytes from the older single-table layout. Size the Render database
   for the expected document volume. The old `GCP_SERVICE_ACCOUNT_JSON`,
   `PUBLIC_OBJECT_SEARCH_PATHS` and `PRIVATE_OBJECT_DIR` variables are no
   longer used and can be deleted.
4. Provision the Render database schema before first use. The repository's
   `@workspace/db push` command is intentionally blocked when
   `NODE_ENV=production`; use a reviewed SQL migration or run the schema
   provisioning command from a controlled non-production environment against
   the new database.
5. Replace `https://petrotrack-1.onrender.com/` in `app.json` if a custom
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