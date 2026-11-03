-- F1 explainable triage: priority_anchor replaces priority_score and
-- priority_score_updated_at. No application code ever wrote those two columns
-- (always 0 and NULL), so dropping them loses no data. Anchors and trust scores
-- are filled by the recompute step that runs after migrations on deploy.

-- AlterTable
ALTER TABLE "reports" DROP COLUMN "priority_score",
DROP COLUMN "priority_score_updated_at",
ADD COLUMN     "priority_anchor" INTEGER;

-- CreateIndex
CREATE INDEX "reports_priority_anchor_created_at_idx" ON "reports"("priority_anchor" DESC, "created_at" DESC);

