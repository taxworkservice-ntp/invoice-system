-- Allow the quotation per-line example-photo purpose in files.purpose.
-- The client uploads line images to line-images/{userId}/{uuid}.{ext} via
-- /api/storage/upload-file; the server allowlist (getStoragePurpose) was
-- extended but this CHECK constraint still rejects the new value on upsert.
-- Constraint was created inline (sql/add_r2_file_metadata.sql) → default
-- name files_purpose_check.

alter table files drop constraint if exists files_purpose_check;

alter table files add constraint files_purpose_check
  check (purpose in (
    'logos',
    'signatures',
    'stamps',
    'pdfs',
    'exports',
    'attachments',
    'line-images'
  ));
