CREATE TABLE "RecordMigrationCheckpoint" (
  "companyId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "manifest" JSONB NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecordMigrationCheckpoint_pkey" PRIMARY KEY ("companyId", "version"),
  CONSTRAINT "RecordMigrationCheckpoint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
