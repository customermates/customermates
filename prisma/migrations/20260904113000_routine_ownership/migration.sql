-- Keep routines and their history when an owner leaves, while preserving who paid for each run.
ALTER TABLE "RoutineRun"
ADD COLUMN "executedByUserId" TEXT,
ADD COLUMN "executedByName" TEXT;

UPDATE "RoutineRun" AS run
SET
  "executedByUserId" = routine."ownerUserId",
  "executedByName" = COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', owner."firstName", owner."lastName")), ''), 'Former user')
FROM "Routine" AS routine
JOIN "User" AS owner ON owner."id" = routine."ownerUserId"
WHERE run."routineId" = routine."id";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RoutineRun"
    WHERE "executedByUserId" IS NULL OR "executedByName" IS NULL
  ) THEN
    RAISE EXCEPTION 'Routine run executor backfill failed';
  END IF;
END $$;

ALTER TABLE "RoutineRun"
ALTER COLUMN "executedByUserId" SET NOT NULL,
ALTER COLUMN "executedByName" SET NOT NULL;

ALTER TABLE "Routine" DROP CONSTRAINT "Routine_ownerUserId_fkey";
ALTER TABLE "Routine" ALTER COLUMN "ownerUserId" DROP NOT NULL;
ALTER TABLE "Routine"
ADD CONSTRAINT "Routine_ownerUserId_fkey"
FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Routine"
ADD CONSTRAINT "Routine_enabled_requires_owner"
CHECK (NOT "enabled" OR "ownerUserId" IS NOT NULL);

CREATE INDEX "RoutineRun_executedByUserId_status_idx"
ON "RoutineRun"("executedByUserId", "status");

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
