ALTER TABLE "User"
  ADD COLUMN "googleAdsClickId" VARCHAR(512),
  ADD COLUMN "googleAdsClickIdKind" VARCHAR(8),
  ADD COLUMN "googleAdsClickIdCapturedAt" TIMESTAMP(3),
  ADD COLUMN "googleAdsAttributionConsentedAt" TIMESTAMP(3),
  ADD COLUMN "googleAdsClickIdExpiresAt" TIMESTAMP(3);

CREATE INDEX "User_googleAdsClickIdExpiresAt_id_idx"
  ON "User"("googleAdsClickIdExpiresAt", "id");
