-- Trigram matching for text search (ILIKE %term%). Created here because the
-- schema does not manage extensions (see the PostGIS note in schema.prisma).
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateIndex
CREATE INDEX "reports_user_id_idx" ON "reports"("user_id");

-- CreateIndex
CREATE INDEX "reports_latitude_longitude_idx" ON "reports"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "idx_reports_title_trgm" ON "reports" USING GIN ("title" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "idx_reports_description_trgm" ON "reports" USING GIN ("description" gin_trgm_ops);

