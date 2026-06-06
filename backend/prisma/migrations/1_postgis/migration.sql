-- PostGIS support for reports.location (SRS v1.1 §8.2.2, PERF-005, SCAL-002).
-- The extension itself is created by the 0_init migration. This migration adds
-- the sync trigger (keeps location derived from latitude/longitude) and the
-- GiST index used by /reports/nearby and /reports/map bbox queries.

-- Backfill the geography column from existing lat/lng (no-op on a fresh DB).
UPDATE "reports"
SET "location" = ST_SetSRID(ST_MakePoint("longitude"::double precision, "latitude"::double precision), 4326)::geography
WHERE "location" IS NULL;

-- Keep location derived from latitude/longitude automatically.
CREATE OR REPLACE FUNCTION reports_sync_location()
RETURNS trigger AS $$
BEGIN
  NEW."location" := ST_SetSRID(
    ST_MakePoint(NEW."longitude"::double precision, NEW."latitude"::double precision),
    4326
  )::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reports_sync_location ON "reports";
CREATE TRIGGER trg_reports_sync_location
BEFORE INSERT OR UPDATE OF "latitude", "longitude" ON "reports"
FOR EACH ROW
EXECUTE FUNCTION reports_sync_location();

-- Geospatial index for nearby and bbox queries.
CREATE INDEX IF NOT EXISTS idx_reports_location_gist
ON "reports"
USING GIST ("location");
