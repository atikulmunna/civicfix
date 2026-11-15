-- Every report's first history row says "Report submitted." (F5). Rows written before
-- note keys existed get the key, so the web app can word that line in Bangla. Only
-- the server writes a report's first row (old_status IS NULL), so this exact text
-- there is never an admin's own note. Rows already keyed are left alone, so running
-- this again changes nothing.

UPDATE "status_history"
SET "note_key" = 'report.submitted', "note_params" = '{}'::jsonb
WHERE "note_key" IS NULL AND "old_status" IS NULL AND "note" = 'Report submitted.';
