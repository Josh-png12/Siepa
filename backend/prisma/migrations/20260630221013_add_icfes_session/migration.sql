-- CreateEnum
CREATE TYPE "IcfesSession" AS ENUM ('SESION_1', 'SESION_2', 'AMBAS');

-- AlterTable
ALTER TABLE "PhysicalSimulacro" ADD COLUMN     "session" "IcfesSession" NOT NULL DEFAULT 'SESION_1';
