-- CreateEnum
CREATE TYPE "AgentConversationOrigin" AS ENUM ('user', 'routine');

-- CreateEnum
CREATE TYPE "RoutineTriggerKind" AS ENUM ('schedule', 'event');

-- CreateEnum
CREATE TYPE "RoutineRunStatus" AS ENUM ('queued', 'running', 'succeeded', 'partial', 'failed', 'skipped', 'blocked');

-- AlterEnum
ALTER TYPE "Resource" ADD VALUE 'routines';

-- AlterTable
ALTER TABLE "AgentConversation" ADD COLUMN     "creditCeiling" INTEGER,
ADD COLUMN     "origin" "AgentConversationOrigin" NOT NULL DEFAULT 'user';

-- CreateTable
CREATE TABLE "Routine" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "name" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "modelKey" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "triggerKind" "RoutineTriggerKind" NOT NULL,
    "cronExpression" TEXT,
    "timezone" TEXT,
    "runOnceAt" TIMESTAMP(3),
    "triggerEvents" TEXT[],
    "changedFields" TEXT[],
    "triggerFilters" JSONB,
    "debounceSeconds" INTEGER NOT NULL DEFAULT 300,
    "maxRunsPerHour" INTEGER NOT NULL DEFAULT 4,
    "maxCreditsPerRun" INTEGER NOT NULL DEFAULT 10,
    "nextRunAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastRunStatus" "RoutineRunStatus",
    "disabledReason" TEXT,
    "suppressedEventCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Routine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoutineRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "executedByUserId" TEXT NOT NULL,
    "executedByName" TEXT NOT NULL,
    "conversationId" TEXT,
    "turnRequestId" TEXT,
    "status" "RoutineRunStatus" NOT NULL DEFAULT 'queued',
    "triggerKind" "RoutineTriggerKind" NOT NULL,
    "triggerEvent" TEXT,
    "triggerEntityId" TEXT,
    "triggerPayload" JSONB,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "terminalCode" "AgentTurnTerminalCode",
    "chargedCredits" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoutineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Routine_companyId_idx" ON "Routine"("companyId");

-- CreateIndex
CREATE INDEX "Routine_companyId_enabled_idx" ON "Routine"("companyId", "enabled");

-- CreateIndex
CREATE INDEX "Routine_enabled_nextRunAt_idx" ON "Routine"("enabled", "nextRunAt");

-- CreateIndex
CREATE INDEX "Routine_ownerUserId_idx" ON "Routine"("ownerUserId");

-- CreateIndex
CREATE INDEX "RoutineRun_companyId_idx" ON "RoutineRun"("companyId");

-- CreateIndex
CREATE INDEX "RoutineRun_companyId_routineId_createdAt_idx" ON "RoutineRun"("companyId", "routineId", "createdAt");

-- CreateIndex
CREATE INDEX "RoutineRun_status_scheduledFor_idx" ON "RoutineRun"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "RoutineRun_routineId_status_idx" ON "RoutineRun"("routineId", "status");

-- CreateIndex
CREATE INDEX "RoutineRun_conversationId_idx" ON "RoutineRun"("conversationId");

-- CreateIndex
CREATE INDEX "RoutineRun_executedByUserId_status_idx" ON "RoutineRun"("executedByUserId", "status");

-- CreateIndex
CREATE INDEX "AgentConversation_companyId_userId_origin_archivedAt_update_idx" ON "AgentConversation"("companyId", "userId", "origin", "archivedAt", "updatedAt");

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- An ownerless routine has nobody to run as, so it may exist but never be enabled.
ALTER TABLE "Routine" ADD CONSTRAINT "Routine_enabled_requires_owner" CHECK (NOT "enabled" OR "ownerUserId" IS NOT NULL);

-- AddForeignKey
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "Routine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoutineRun" ADD CONSTRAINT "RoutineRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A routine outlives its owner. When an owner is deleted or leaves the active roster the
-- routine is paused rather than removed, its in-flight runs are settled rather than left
-- hanging, and any credits it reserved are released. This has to be a trigger: it must run
-- inside the same transaction as the user change, and on the delete path the application
-- never gets to act because the conversation and turn have already cascaded away.

CREATE FUNCTION pause_routines_for_unavailable_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND NEW."status" <> 'active') THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(OLD."companyId", 0));

    -- A turn can be admitted immediately before the routine worker records its linkage.
    -- Recover it through the run idempotency key before settling the owner's work.
    UPDATE "RoutineRun" AS run
    SET
      "conversationId" = turn."conversationId",
      "turnRequestId" = turn."id",
      "updatedAt" = CURRENT_TIMESTAMP
    FROM "AgentTurnRequest" AS turn
    WHERE run."executedByUserId" = OLD."id"
      AND run."companyId" = OLD."companyId"
      AND run."status" = 'running'
      AND run."turnRequestId" IS NULL
      AND turn."companyId" = run."companyId"
      AND turn."userId" = OLD."id"
      AND turn."clientRequestId" = run."id"
      AND EXISTS (
        SELECT 1
        FROM "AgentConversation" AS conversation
        WHERE conversation."id" = turn."conversationId"
          AND conversation."origin" = 'routine'
      );

    -- Quiesce the credit ledger before a user deletion can cascade the turn and lease.
    -- Pre-provider reservations are free; provider-started reservations are retained
    -- conservatively at their already-approved ceiling.
    UPDATE "AgentUsageEvent"
    SET
      "state" = CASE
        WHEN "providerStartedAt" IS NULL THEN 'released'::"AgentUsageState"
        ELSE 'retained'::"AgentUsageState"
      END,
      "chargedCredits" = CASE WHEN "providerStartedAt" IS NULL THEN 0 ELSE "reservedCredits" END,
      "settledAt" = CURRENT_TIMESTAMP
    WHERE "companyId" = OLD."companyId"
      AND "userId" = OLD."id"
      AND "state" = 'reserved';

    -- A terminal turn may have committed immediately before routine reconciliation.
    -- Preserve its real outcome before owner removal can cascade the transcript.
    WITH terminal_outcomes AS (
      SELECT
        run."id",
        run."routineId",
        (CASE
          WHEN turn."status" IN ('failed', 'uncertain') THEN 'failed'
          WHEN turn."terminalCode" = 'cancelled' THEN 'skipped'
          WHEN turn."terminalCode" = 'completed' THEN 'succeeded'
          WHEN turn."terminalCode" IN ('partial', 'policyBreach') THEN 'partial'
          ELSE 'failed'
        END)::"RoutineRunStatus" AS "status",
        turn."terminalCode",
        COALESCE(turn."terminalAt", turn."updatedAt", CURRENT_TIMESTAMP) AS "finishedAt",
        COALESCE(usage."chargedCredits", 0) AS "chargedCredits",
        CASE
          WHEN CHAR_LENGTH(summary."text") > 280 THEN LEFT(summary."text", 279) || '…'
          ELSE summary."text"
        END AS "summary"
      FROM "RoutineRun" AS run
      JOIN "AgentTurnRequest" AS turn
        ON turn."id" = run."turnRequestId"
       AND turn."companyId" = run."companyId"
       AND turn."userId" = run."executedByUserId"
      JOIN "AgentConversation" AS conversation
        ON conversation."id" = turn."conversationId"
       AND conversation."companyId" = run."companyId"
       AND conversation."userId" = run."executedByUserId"
       AND conversation."origin" = 'routine'
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(event."chargedCredits"), 0)::INTEGER AS "chargedCredits"
        FROM "AgentUsageEvent" AS event
        WHERE event."turnRequestId" = turn."id"
      ) AS usage ON TRUE
      LEFT JOIN LATERAL (
        SELECT message."parts"
        FROM "AgentMessage" AS message
        WHERE message."turnRequestId" = turn."id"
          AND message."companyId" = run."companyId"
          AND message."role" = 'assistant'
        ORDER BY message."sequence" DESC
        LIMIT 1
      ) AS assistant ON TRUE
      LEFT JOIN LATERAL (
        SELECT NULLIF(
          BTRIM(
            REGEXP_REPLACE(
              STRING_AGG(part."value"->>'text', ' ' ORDER BY part."ordinality"),
              '[[:space:]]+',
              ' ',
              'g'
            )
          ),
          ''
        ) AS "text"
        FROM JSONB_ARRAY_ELEMENTS(
          CASE
            WHEN JSONB_TYPEOF(assistant."parts") = 'array' THEN assistant."parts"
            ELSE '[]'::jsonb
          END
        ) WITH ORDINALITY AS part("value", "ordinality")
        WHERE part."value"->>'type' = 'text'
          AND JSONB_TYPEOF(part."value"->'text') = 'string'
      ) AS summary ON TRUE
      WHERE run."executedByUserId" = OLD."id"
        AND run."companyId" = OLD."companyId"
        AND run."status" = 'running'
        AND turn."status" IN ('completed', 'failed', 'uncertain')
    ),
    reconciled AS (
      UPDATE "RoutineRun" AS run
      SET
        "status" = outcome."status",
        "terminalCode" = outcome."terminalCode",
        "chargedCredits" = GREATEST(run."chargedCredits", outcome."chargedCredits"),
        "summary" = outcome."summary",
        "error" = NULL,
        "finishedAt" = outcome."finishedAt",
        "updatedAt" = CURRENT_TIMESTAMP
      FROM terminal_outcomes AS outcome
      WHERE run."id" = outcome."id"
      RETURNING run."id", run."routineId", run."status", run."finishedAt"
    ),
    latest AS (
      SELECT DISTINCT ON ("routineId") "routineId", "status", "finishedAt", "id"
      FROM reconciled
      ORDER BY "routineId", "finishedAt" DESC, "id" DESC
    )
    UPDATE "Routine" AS routine
    SET
      "lastRunStatus" = latest."status",
      "lastRunAt" = latest."finishedAt",
      "updatedAt" = CURRENT_TIMESTAMP
    FROM latest
    WHERE routine."id" = latest."routineId"
      AND (routine."lastRunAt" IS NULL OR routine."lastRunAt" <= latest."finishedAt");

    UPDATE "AgentTurnRequest"
    SET
      "status" = CASE
        WHEN "providerStartedAt" IS NULL THEN 'failed'::"AgentTurnStatus"
        ELSE 'uncertain'::"AgentTurnStatus"
      END,
      "cancellationRequestedAt" = COALESCE("cancellationRequestedAt", CURRENT_TIMESTAMP),
      "terminalAt" = CURRENT_TIMESTAMP,
      "terminalCode" = NULL,
      "affectedResources" = '[]'::jsonb,
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "companyId" = OLD."companyId"
      AND "userId" = OLD."id"
      AND "status" IN ('running', 'waitingBudget', 'needsAttention');

    DELETE FROM "AgentRunLease"
    WHERE "companyId" = OLD."companyId"
      AND "userId" = OLD."id";

    WITH blocked AS (
      UPDATE "RoutineRun" AS run
      SET
        "status" = 'blocked',
        "error" = 'ownerUnavailable',
        "chargedCredits" = GREATEST(
          run."chargedCredits",
          COALESCE((
            SELECT SUM(usage."chargedCredits")::INTEGER
            FROM "AgentUsageEvent" AS usage
            WHERE usage."turnRequestId" = run."turnRequestId"
          ), 0)
        ),
        "finishedAt" = CURRENT_TIMESTAMP,
        "updatedAt" = CURRENT_TIMESTAMP
      WHERE run."executedByUserId" = OLD."id"
        AND run."companyId" = OLD."companyId"
        AND run."status" IN ('queued', 'running')
      RETURNING run."id", run."routineId", run."status", run."finishedAt"
    ),
    latest AS (
      SELECT DISTINCT ON ("routineId") "routineId", "status", "finishedAt", "id"
      FROM blocked
      ORDER BY "routineId", "finishedAt" DESC, "id" DESC
    )
    UPDATE "Routine" AS routine
    SET
      "lastRunStatus" = latest."status",
      "lastRunAt" = latest."finishedAt",
      "updatedAt" = CURRENT_TIMESTAMP
    FROM latest
    WHERE routine."id" = latest."routineId"
      AND (routine."lastRunAt" IS NULL OR routine."lastRunAt" <= latest."finishedAt");

    UPDATE "Routine"
    SET
      "enabled" = FALSE,
      "nextRunAt" = NULL,
      "disabledReason" = 'ownerUnavailable',
      "updatedAt" = CURRENT_TIMESTAMP
    WHERE "ownerUserId" = OLD."id";
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER "User_pause_routines_before_status_change"
BEFORE UPDATE OF "status" ON "User"
FOR EACH ROW
EXECUTE FUNCTION pause_routines_for_unavailable_owner();

CREATE TRIGGER "User_pause_routines_before_delete"
BEFORE DELETE ON "User"
FOR EACH ROW
EXECUTE FUNCTION pause_routines_for_unavailable_owner();

-- Apply the same invariant to owners who were already unavailable before this migration.
UPDATE "User"
SET "status" = "status"
WHERE "status" <> 'active';
