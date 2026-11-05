-- CreateEnum
CREATE TYPE "FixVerdict" AS ENUM ('confirmed', 'disputed');

-- CreateTable
CREATE TABLE "fix_checks" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "image_id" UUID NOT NULL,
    "verdict" "FixVerdict" NOT NULL,
    "resolved_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fix_checks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fix_checks_image_id_key" ON "fix_checks"("image_id");

-- CreateIndex
CREATE INDEX "fix_checks_report_id_created_at_idx" ON "fix_checks"("report_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "fix_checks_report_id_resolved_at_user_id_key" ON "fix_checks"("report_id", "resolved_at", "user_id");

-- AddForeignKey
ALTER TABLE "fix_checks" ADD CONSTRAINT "fix_checks_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fix_checks" ADD CONSTRAINT "fix_checks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fix_checks" ADD CONSTRAINT "fix_checks_image_id_fkey" FOREIGN KEY ("image_id") REFERENCES "report_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
