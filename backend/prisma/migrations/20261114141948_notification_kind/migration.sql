-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "kind" VARCHAR(40),
ADD COLUMN     "params" JSONB;
