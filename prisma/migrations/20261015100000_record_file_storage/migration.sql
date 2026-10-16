-- Enterprise contracts set the file storage each active user adds to the workspace pool; NULL uses the default.
ALTER TABLE "Subscription" ADD COLUMN "enterpriseFileStorageBytesPerUser" BIGINT;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_enterprise_file_storage_valid"
  CHECK ("enterpriseFileStorageBytesPerUser" IS NULL OR "enterpriseFileStorageBytesPerUser" BETWEEN 1 AND 1099511627776);

-- The daily file cleanup finds detached files whose 30 days have passed without scanning a workspace's other files.
CREATE INDEX "RecordFile_companyId_status_detachedAt_idx" ON "RecordFile"("companyId", "status", "detachedAt");
