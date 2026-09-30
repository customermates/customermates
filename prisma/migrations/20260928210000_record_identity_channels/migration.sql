CREATE TABLE "RecordIdentity" (
  "companyId" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "provider" "MessagingProvider" NOT NULL,
  "channelClass" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "messagingId" TEXT,
  "displayName" TEXT,
  "profileUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecordIdentity_pkey" PRIMARY KEY ("companyId", "id"),
  CONSTRAINT "RecordIdentity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecordIdentity_companyId_typeId_recordId_fkey" FOREIGN KEY ("companyId", "typeId", "recordId") REFERENCES "CrmRecord"("companyId", "typeId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecordIdentity_companyId_id_channelClass_key" ON "RecordIdentity"("companyId", "id", "channelClass");
CREATE INDEX "RecordIdentity_companyId_typeId_recordId_idx" ON "RecordIdentity"("companyId", "typeId", "recordId");
CREATE TABLE "RecordIdentityKey" (
  "companyId" TEXT NOT NULL,
  "channelClass" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "identityId" TEXT NOT NULL,
  CONSTRAINT "RecordIdentityKey_pkey" PRIMARY KEY ("companyId", "channelClass", "value"),
  CONSTRAINT "RecordIdentityKey_companyId_identityId_channelClass_fkey" FOREIGN KEY ("companyId", "identityId", "channelClass") REFERENCES "RecordIdentity"("companyId", "id", "channelClass") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecordIdentityKey_companyId_identityId_channelClass_idx" ON "RecordIdentityKey"("companyId", "identityId", "channelClass");
