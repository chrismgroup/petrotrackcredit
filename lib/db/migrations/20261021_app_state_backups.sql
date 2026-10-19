-- App-state backups (12-hour scheduled and manual) are stored directly in
-- PostgreSQL. The API also creates this table automatically on first use, so
-- running this file is optional.
CREATE TABLE IF NOT EXISTS app_state_backups (
  object_name TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  size_bytes INTEGER NOT NULL,
  payload TEXT NOT NULL
);
