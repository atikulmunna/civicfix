-- AlterTable
ALTER TABLE "reports" ADD COLUMN     "confirm_count" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "reports_confirm_count_created_at_idx" ON "reports"("confirm_count" DESC, "created_at" DESC);


-- Backfill from existing votes.
UPDATE "reports" AS r
SET "confirm_count" = c.n
FROM (
  SELECT "report_id", COUNT(*)::int AS n
  FROM "votes"
  WHERE "vote_type" = 'confirm'
  GROUP BY "report_id"
) AS c
WHERE r."id" = c."report_id";

-- Keep confirm_count in sync with confirm votes, whatever writes them
-- (application code, cascades, manual fixes). Same approach as the location
-- trigger in 1_postgis.
CREATE OR REPLACE FUNCTION reports_sync_confirm_count()
RETURNS trigger AS $$
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW."vote_type" = 'confirm' THEN
    UPDATE "reports" SET "confirm_count" = "confirm_count" + 1 WHERE "id" = NEW."report_id";
  END IF;
  IF TG_OP IN ('DELETE', 'UPDATE') AND OLD."vote_type" = 'confirm' THEN
    UPDATE "reports" SET "confirm_count" = "confirm_count" - 1 WHERE "id" = OLD."report_id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_votes_sync_confirm_count ON "votes";
CREATE TRIGGER trg_votes_sync_confirm_count
AFTER INSERT OR DELETE OR UPDATE OF "vote_type", "report_id" ON "votes"
FOR EACH ROW
EXECUTE FUNCTION reports_sync_confirm_count();
