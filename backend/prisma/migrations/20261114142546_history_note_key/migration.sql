-- AlterTable
ALTER TABLE "status_history" ADD COLUMN     "note_key" VARCHAR(40),
ADD COLUMN     "note_params" JSONB;
