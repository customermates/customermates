CREATE TABLE "RecordEventSubscription" (
  "companyId" TEXT NOT NULL,
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('routine', 'webhook')),
  "ownerUserId" TEXT NOT NULL,
  "typeId" TEXT,
  "events" TEXT[] NOT NULL,
  "changedFieldIds" TEXT[] NOT NULL,
  "query" JSONB,
  "revision" INTEGER NOT NULL DEFAULT 1 CHECK ("revision" > 0),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "RecordEventSubscription_pkey" PRIMARY KEY ("companyId", "id"),
  CONSTRAINT "RecordEventSubscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecordEventSubscription_companyId_ownerUserId_fkey" FOREIGN KEY ("companyId", "ownerUserId") REFERENCES "User"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecordEventSubscription_companyId_typeId_fkey" FOREIGN KEY ("companyId", "typeId") REFERENCES "RecordTypeDefinition"("companyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "RecordEventSubscription_query_type_check" CHECK ("query" IS NULL OR ("typeId" IS NOT NULL AND "query"->>'typeId' = "typeId") IS TRUE)
);
CREATE INDEX "RecordEventSubscription_companyId_enabled_typeId_idx" ON "RecordEventSubscription"("companyId", "enabled", "typeId");
CREATE INDEX "RecordEventSubscription_companyId_ownerUserId_idx" ON "RecordEventSubscription"("companyId", "ownerUserId");
CREATE TABLE "RecordEventMatch" (
  "companyId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "subscriptionRevision" INTEGER NOT NULL,
  CONSTRAINT "RecordEventMatch_pkey" PRIMARY KEY ("companyId", "eventId", "subscriptionId"),
  CONSTRAINT "RecordEventMatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecordEventMatch_companyId_eventId_fkey" FOREIGN KEY ("companyId", "eventId") REFERENCES "RecordEvent"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RecordEventMatch_companyId_subscriptionId_fkey" FOREIGN KEY ("companyId", "subscriptionId") REFERENCES "RecordEventSubscription"("companyId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecordEventMatch_companyId_subscriptionId_idx" ON "RecordEventMatch"("companyId", "subscriptionId");
