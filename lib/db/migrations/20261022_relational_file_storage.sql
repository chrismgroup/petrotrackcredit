-- Relational file storage: file details in stored_files (linked to staff_users),
-- file bytes in stored_file_contents (cascade delete), plus a stored_files_overview
-- view for management. Moves bytes out of the older inline stored_files.data column.
-- The API applies this automatically on first use; running it manually is optional.
CREATE TABLE IF NOT EXISTS stored_files (
  object_path TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE stored_files ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general';
ALTER TABLE stored_files ADD COLUMN IF NOT EXISTS related_id TEXT;
ALTER TABLE stored_files ADD COLUMN IF NOT EXISTS branch_id TEXT;
ALTER TABLE stored_files ADD COLUMN IF NOT EXISTS uploaded_by_user_id INTEGER
  REFERENCES staff_users(id) ON DELETE SET NULL;
ALTER TABLE stored_files ADD COLUMN IF NOT EXISTS sha256 TEXT;
CREATE TABLE IF NOT EXISTS stored_file_contents (
  object_path TEXT PRIMARY KEY REFERENCES stored_files(object_path) ON DELETE CASCADE,
  data BYTEA NOT NULL
);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'stored_files' AND column_name = 'data'
  ) THEN
    INSERT INTO stored_file_contents (object_path, data)
      SELECT object_path, data FROM stored_files WHERE data IS NOT NULL
      ON CONFLICT (object_path) DO NOTHING;
    UPDATE stored_files f SET uploaded_by_user_id = u.id
      FROM staff_users u WHERE f.uploaded_by_user_id IS NULL AND u.username = f.uploaded_by;
    ALTER TABLE stored_files DROP COLUMN data;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS stored_files_category_idx ON stored_files (category, related_id);
CREATE INDEX IF NOT EXISTS stored_files_uploader_idx ON stored_files (uploaded_by_user_id);
CREATE INDEX IF NOT EXISTS stored_files_branch_idx ON stored_files (branch_id);
CREATE OR REPLACE VIEW stored_files_overview AS
  SELECT f.object_path, f.name, f.content_type, f.size, f.category, f.related_id, f.branch_id,
         f.uploaded_by, u.emp_name AS uploaded_by_name, u.role AS uploaded_by_role, f.created_at
  FROM stored_files f
  LEFT JOIN staff_users u ON u.id = f.uploaded_by_user_id;
