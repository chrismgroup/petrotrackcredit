-- Uploaded documents (My Folders, meeting-minute attachments, HR enrollment
-- documents) are stored directly in PostgreSQL. The API also creates this
-- table automatically on first use, so running this file is optional.
CREATE TABLE IF NOT EXISTS stored_files (
  object_path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
