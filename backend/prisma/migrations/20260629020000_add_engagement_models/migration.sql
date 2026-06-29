-- CreateEnum: ICFES area categories
CREATE TYPE "IcfesArea" AS ENUM (
  'LECTURA_CRITICA',
  'MATEMATICAS',
  'CIENCIAS_NATURALES',
  'CIENCIAS_SOCIALES',
  'INGLES'
);

-- CreateTable: daily activity streaks per student
CREATE TABLE "StudentStreak" (
    "id"               TEXT NOT NULL,
    "studentId"        TEXT NOT NULL,
    "schoolId"         TEXT NOT NULL,
    "currentStreak"    INTEGER NOT NULL DEFAULT 0,
    "longestStreak"    INTEGER NOT NULL DEFAULT 0,
    "lastActivityDate" TIMESTAMP(3),
    "updatedAt"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentStreak_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentStreak_studentId_key" ON "StudentStreak"("studentId");
CREATE INDEX "StudentStreak_schoolId_idx" ON "StudentStreak"("schoolId");

ALTER TABLE "StudentStreak"
    ADD CONSTRAINT "StudentStreak_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: badges earned by students
CREATE TABLE "StudentBadge" (
    "id"        TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId"  TEXT NOT NULL,
    "badgeKey"  TEXT NOT NULL,
    "earnedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt"    TIMESTAMP(3),

    CONSTRAINT "StudentBadge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentBadge_studentId_badgeKey_key" ON "StudentBadge"("studentId", "badgeKey");
CREATE INDEX "StudentBadge_studentId_earnedAt_idx" ON "StudentBadge"("studentId", "earnedAt" DESC);
CREATE INDEX "StudentBadge_schoolId_idx" ON "StudentBadge"("schoolId");

ALTER TABLE "StudentBadge"
    ADD CONSTRAINT "StudentBadge_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: per-area progress for each student (scores 0-100, target on ICFES 0-500 scale)
CREATE TABLE "StudentAreaProgress" (
    "id"              TEXT NOT NULL,
    "studentId"       TEXT NOT NULL,
    "schoolId"        TEXT NOT NULL,
    "area"            "IcfesArea" NOT NULL,
    "lastScore"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bestScore"       DOUBLE PRECISION NOT NULL DEFAULT 0,
    "averageScore"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetScore"     DOUBLE PRECISION NOT NULL DEFAULT 300,
    "totalSimulacros" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentAreaProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentAreaProgress_studentId_area_key" ON "StudentAreaProgress"("studentId", "area");
CREATE INDEX "StudentAreaProgress_studentId_idx" ON "StudentAreaProgress"("studentId");
CREATE INDEX "StudentAreaProgress_schoolId_idx" ON "StudentAreaProgress"("schoolId");

ALTER TABLE "StudentAreaProgress"
    ADD CONSTRAINT "StudentAreaProgress_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "School"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
