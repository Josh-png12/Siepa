-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('PENDING', 'PROCESSED', 'RELEASED', 'REVIEW_REQUIRED');

-- AlterTable: add result-visibility fields to PhysicalAnswerSheet
ALTER TABLE "PhysicalAnswerSheet"
    ADD COLUMN "resultStatus" "ResultStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "releasedAt"   TIMESTAMP(3),
    ADD COLUMN "releasedBy"   TEXT,
    ADD COLUMN "reviewNote"   TEXT;

-- CreateIndex for fast status queries on PhysicalAnswerSheet
CREATE INDEX "PhysicalAnswerSheet_physicalSimulacroId_resultStatus_idx"
    ON "PhysicalAnswerSheet"("physicalSimulacroId", "resultStatus");

-- CreateTable: immutable audit log for result status transitions
CREATE TABLE "SimulacroStatusLog" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "simulacroId" TEXT NOT NULL,
    "studentId"   TEXT NOT NULL,
    "fromStatus"  "ResultStatus",
    "toStatus"    "ResultStatus" NOT NULL,
    "changedBy"   TEXT NOT NULL,
    "reason"      TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SimulacroStatusLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SimulacroStatusLog_tenantId_simulacroId_createdAt_idx"
    ON "SimulacroStatusLog"("tenantId", "simulacroId", "createdAt" DESC);

CREATE INDEX "SimulacroStatusLog_simulacroId_studentId_idx"
    ON "SimulacroStatusLog"("simulacroId", "studentId");

-- AddForeignKey
ALTER TABLE "SimulacroStatusLog"
    ADD CONSTRAINT "SimulacroStatusLog_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "School"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
