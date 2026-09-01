-- CreateEnum
CREATE TYPE "RoutineRiskKind" AS ENUM ('selfLoop', 'mutualLoop');

-- CreateEnum
CREATE TYPE "RoutineRiskSeverity" AS ENUM ('info', 'warning');

-- CreateTable
CREATE TABLE "RoutineRiskFinding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "peerRoutineId" TEXT,
    "kind" "RoutineRiskKind" NOT NULL,
    "severity" "RoutineRiskSeverity" NOT NULL DEFAULT 'warning',
    "triggerEvent" TEXT NOT NULL,
    "confidence" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoutineRiskFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoutineRiskFinding_companyId_idx" ON "RoutineRiskFinding"("companyId");

-- CreateIndex
CREATE INDEX "RoutineRiskFinding_companyId_resolvedAt_idx" ON "RoutineRiskFinding"("companyId", "resolvedAt");

-- CreateIndex
CREATE INDEX "RoutineRiskFinding_routineId_resolvedAt_idx" ON "RoutineRiskFinding"("routineId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RoutineRiskFinding_routineId_kind_triggerEvent_peerRoutineI_key" ON "RoutineRiskFinding"("routineId", "kind", "triggerEvent", "peerRoutineId");

-- AddForeignKey
ALTER TABLE "RoutineRiskFinding" ADD CONSTRAINT "RoutineRiskFinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRiskFinding" ADD CONSTRAINT "RoutineRiskFinding_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
