-- The seed used to set a resolved report's resolved_at three days after it was
-- created, while its status history said it was resolved about a day after.
-- Report pages showed two different dates, and the scorecards (F2) measured
-- time to resolve from the wrong one.
--
-- Set a resolved report's resolved_at to its latest RESOLVED history time, only
-- when the two are more than a minute apart. The app writes both in one
-- transaction, so its own reports are not affected. Fix checks (F3) of that fix
-- are keyed by resolved_at, so they move with it and stay attached. Safe to run
-- more than once. The schema does not change.
WITH "target" AS (
  SELECT r."id" AS "report_id", r."resolved_at" AS "old_at", h."resolved_at" AS "new_at"
  FROM "reports" AS r
  JOIN (
    SELECT "report_id", MAX("created_at") AS "resolved_at"
    FROM "status_history"
    WHERE "new_status" = 'RESOLVED'
    GROUP BY "report_id"
  ) AS h ON h."report_id" = r."id"
  WHERE r."status" IN ('RESOLVED', 'ARCHIVED')
    AND r."resolved_at" IS NOT NULL
    AND ABS(EXTRACT(EPOCH FROM r."resolved_at" - h."resolved_at")) > 60
),
"moved_checks" AS (
  UPDATE "fix_checks" AS f
  SET "resolved_at" = t."new_at"
  FROM "target" AS t
  WHERE f."report_id" = t."report_id"
    AND f."resolved_at" = t."old_at"
)
UPDATE "reports" AS r
SET "resolved_at" = t."new_at"
FROM "target" AS t
WHERE r."id" = t."report_id";
