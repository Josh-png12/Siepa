-- AlterTable
ALTER TABLE "PhysicalAnswerSheet" ADD COLUMN     "isSandbox" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PhysicalSimulacro" ADD COLUMN     "isSandbox" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "PhysicalSimulacro_schoolId_isSandbox_idx" ON "PhysicalSimulacro"("schoolId", "isSandbox");
