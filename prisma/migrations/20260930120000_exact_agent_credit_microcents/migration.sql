-- Exact hosted-AI metering: the credit ledger moves from whole credits to exact microcents
-- (1 credit = 1 US cent = 1,000,000 microcents). Usage is no longer rounded up to whole credits per
-- turn, and there is no one-credit minimum.
--
-- Expand phase of an expand/contract change. Each whole-credit ledger column gains a BIGINT
-- microcent twin, backfilled as credits x 1,000,000, which is exact, and guarded by the same
-- invariants as its whole-credit column. The application reads only the microcent columns from
-- this release on.
--
-- Production safety for a squash-merge deploy: `prisma migrate deploy` runs during the Vercel build
-- while the previous release still serves traffic, and workflow runs started before the promotion
-- keep executing the previous release's code, which reads and writes only the whole-credit
-- columns. Those columns therefore stay, keep their constraints, and are still written by this
-- release as a conservative whole-credit mirror of every microcent write: usage and reservations
-- round up, allowance snapshots and ceilings round down, and an adjustment rounds away from zero,
-- so the previous release never under-counts a row written by this one. A row the previous release
-- writes after this migration has run carries no microcent value; the follow-up contract migration
-- first sets the microcent column to credits x 1,000,000 wherever it is 0 and the whole-credit
-- column is not, then drops the whole-credit columns once no run of the previous release can still
-- be executing.
--
-- Wiki indexing is charged to the workspace rather than to whichever member's edit scheduled it, so
-- a usage event may now carry no user (purpose 'wikiIndexing').

ALTER TYPE "AgentUsagePurpose" ADD VALUE IF NOT EXISTS 'wikiIndexing';

ALTER TABLE "AgentUsageEvent"
  ADD COLUMN "reservedMicrocents" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "chargedMicrocents" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "allowanceMicrocentsSnapshot" BIGINT NOT NULL DEFAULT 0,
  ALTER COLUMN "userId" DROP NOT NULL;

UPDATE "AgentUsageEvent"
SET
  "reservedMicrocents" = "reservedCredits"::bigint * 1000000,
  "chargedMicrocents" = "chargedCredits"::bigint * 1000000,
  "allowanceMicrocentsSnapshot" = "allowanceCreditsSnapshot"::bigint * 1000000;

ALTER TABLE "AgentUsageEvent"
  ADD CONSTRAINT "AgentUsageEvent_microcents_nonnegative" CHECK (
    "reservedMicrocents" >= 0 AND "chargedMicrocents" >= 0 AND "allowanceMicrocentsSnapshot" >= 0
  ),
  ADD CONSTRAINT "AgentUsageEvent_microcent_charge_within_reservation" CHECK (
    "chargedMicrocents" <= "reservedMicrocents"
  ),
  ADD CONSTRAINT "AgentUsageEvent_reserved_state_uncharged_microcents" CHECK (
    "state" <> 'reserved' OR "chargedMicrocents" = 0
  ),
  ADD CONSTRAINT "AgentUsageEvent_released_state_uncharged_microcents" CHECK (
    "state" <> 'released' OR "chargedMicrocents" = 0
  ),
  -- Compared as text: an enum value added in this transaction cannot be used as an enum yet.
  ADD CONSTRAINT "AgentUsageEvent_user_or_workspace_charge" CHECK (
    "userId" IS NOT NULL OR "purpose"::text = 'wikiIndexing'
  );

-- One accruing workspace row per company, allowance period and calendar month. The existing
-- accrual key treats a null user as distinct, so workspace rows get their own partial key.
CREATE UNIQUE INDEX "AgentUsageEvent_workspace_accrual_key"
  ON "AgentUsageEvent"("companyId", "periodStart", "periodEnd", "purpose", "accrualMonth")
  WHERE "userId" IS NULL;

ALTER TABLE "RoutineRun" ADD COLUMN "chargedMicrocents" BIGINT NOT NULL DEFAULT 0;
UPDATE "RoutineRun" SET "chargedMicrocents" = "chargedCredits"::bigint * 1000000;
ALTER TABLE "RoutineRun"
  ADD CONSTRAINT "RoutineRun_charged_microcents_nonnegative" CHECK ("chargedMicrocents" >= 0);

ALTER TABLE "AgentConversation" ADD COLUMN "creditCeilingMicrocents" BIGINT;
UPDATE "AgentConversation"
SET "creditCeilingMicrocents" = "creditCeiling"::bigint * 1000000
WHERE "creditCeiling" IS NOT NULL;
ALTER TABLE "AgentConversation"
  ADD CONSTRAINT "AgentConversation_credit_ceiling_microcents_valid" CHECK (
    "creditCeilingMicrocents" IS NULL OR "creditCeilingMicrocents" > 0
  );

-- Operators enter corrections in tenths of a credit; a balance reset may need an exact microcent
-- amount to bring the remaining balance to exactly zero. The bound stays one million credits. The
-- non-zero rule stays on the whole-credit column, which this release always writes away from zero,
-- so an adjustment the previous release records during the deploy is not refused; the contract
-- migration moves the rule onto the microcent column after its backfill.
ALTER TABLE "AgentCreditAdjustment" ADD COLUMN "deltaMicrocents" BIGINT NOT NULL DEFAULT 0;
UPDATE "AgentCreditAdjustment" SET "deltaMicrocents" = "creditDelta"::bigint * 1000000;

ALTER TABLE "AgentCreditAdjustment"
  ADD CONSTRAINT "AgentCreditAdjustment_delta_microcents_bounded" CHECK (
    "deltaMicrocents" BETWEEN -1000000000000 AND 1000000000000
  );
