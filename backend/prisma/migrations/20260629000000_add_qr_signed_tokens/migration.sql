-- CreateEnum
CREATE TYPE "QRAuditAction" AS ENUM ('GENERATED', 'VERIFIED_OK', 'VERIFIED_FAIL', 'EXPIRED');

-- CreateTable
CREATE TABLE "PhysicalStudentIssuance" (
    "id" TEXT NOT NULL,
    "physicalSimulacroId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "qrGeneratedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "pdfHash" TEXT,
    "pdfTemplateVersion" TEXT NOT NULL DEFAULT 'v1',

    CONSTRAINT "PhysicalStudentIssuance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QRAuditLog" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "simulacroId" TEXT,
    "studentId" TEXT,
    "qrTokenHash" TEXT NOT NULL,
    "action" "QRAuditAction" NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QRAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalStudentIssuance_qrToken_key" ON "PhysicalStudentIssuance"("qrToken");

-- CreateIndex
CREATE UNIQUE INDEX "PhysicalStudentIssuance_physicalSimulacroId_studentId_key" ON "PhysicalStudentIssuance"("physicalSimulacroId", "studentId");

-- CreateIndex
CREATE INDEX "PhysicalStudentIssuance_physicalSimulacroId_idx" ON "PhysicalStudentIssuance"("physicalSimulacroId");

-- CreateIndex
CREATE INDEX "PhysicalStudentIssuance_qrToken_idx" ON "PhysicalStudentIssuance"("qrToken");

-- CreateIndex
CREATE INDEX "QRAuditLog_schoolId_simulacroId_createdAt_idx" ON "QRAuditLog"("schoolId", "simulacroId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "QRAuditLog_qrTokenHash_idx" ON "QRAuditLog"("qrTokenHash");

-- AddForeignKey
ALTER TABLE "PhysicalStudentIssuance" ADD CONSTRAINT "PhysicalStudentIssuance_physicalSimulacroId_fkey" FOREIGN KEY ("physicalSimulacroId") REFERENCES "PhysicalSimulacro"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhysicalStudentIssuance" ADD CONSTRAINT "PhysicalStudentIssuance_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QRAuditLog" ADD CONSTRAINT "QRAuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
