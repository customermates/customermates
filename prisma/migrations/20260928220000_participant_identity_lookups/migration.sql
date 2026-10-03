ALTER TABLE "MessagingThreadParticipant" ADD COLUMN "identityLookupValue" TEXT;
CREATE INDEX "MessagingThreadParticipant_companyId_provider_identityLookup_idx"
  ON "MessagingThreadParticipant" ("companyId", provider, "identityLookupValue");
