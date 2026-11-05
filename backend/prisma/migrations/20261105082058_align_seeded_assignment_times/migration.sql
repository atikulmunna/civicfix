-- Public scorecards (F2) time everything from a report's assignment. The seed
-- used to backdate reports and their status history but leave each assignment
-- at the seeding time, so all seeded work looked like it happened before the
-- assignment and scored as nothing done.
--
-- Move a current assignment back to its report's latest ASSIGNED history time,
-- only when it is later than that. Assignments made through the app are written
-- with their history row in one transaction, assignment first, so they are not
-- affected. Safe to run more than once. The schema does not change.
UPDATE "report_assignments" AS a
SET "created_at" = h."assigned_at"
FROM (
  SELECT "report_id", MAX("created_at") AS "assigned_at"
  FROM "status_history"
  WHERE "new_status" = 'ASSIGNED'
  GROUP BY "report_id"
) AS h
WHERE a."report_id" = h."report_id"
  AND a."is_current"
  AND a."created_at" > h."assigned_at";
