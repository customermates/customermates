import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { BenchmarkArm } from "./arms";

import { agentRoundWorstCaseCredits } from "@/ee/agent-chat/agent-budget-policy";

export const USD_PER_CREDIT = 0.01;
export const BENCHMARK_PROVIDER_ROUNDS_PER_PROMPT = 32;

export const LEDGER_DDL = [
  "CREATE SCHEMA IF NOT EXISTS local_agent_benchmark",
  `CREATE TABLE IF NOT EXISTS local_agent_benchmark.campaign (
    id uuid PRIMARY KEY,
    label text NOT NULL,
    cap_usd numeric NOT NULL CHECK (cap_usd > 0),
    state text NOT NULL CHECK (state IN ('active', 'paused', 'complete')),
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS local_agent_benchmark.episode (
    id uuid PRIMARY KEY,
    campaign_id uuid NOT NULL REFERENCES local_agent_benchmark.campaign(id),
    arm text NOT NULL,
    case_id text NOT NULL,
    repetition integer NOT NULL,
    runtime_variant text NOT NULL,
    namespace text NOT NULL UNIQUE,
    company_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    state text NOT NULL CHECK (state IN ('prepared', 'running', 'scored', 'failed', 'skipped')),
    reason text,
    artifact_path text,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
  )`,
  `CREATE TABLE IF NOT EXISTS local_agent_benchmark.charge (
    id uuid PRIMARY KEY,
    campaign_id uuid NOT NULL REFERENCES local_agent_benchmark.campaign(id),
    episode_id uuid REFERENCES local_agent_benchmark.episode(id),
    kind text NOT NULL CHECK (kind IN ('turn', 'judge', 'probe')),
    usd numeric NOT NULL CHECK (usd >= 0),
    measured boolean NOT NULL,
    detail jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `WITH ranked AS (
     SELECT id,
            first_value(id) OVER (
              PARTITION BY campaign_id, arm, case_id, repetition, runtime_variant
              ORDER BY (state = 'scored') DESC, created_at DESC, id DESC
            ) AS keep_id,
            row_number() OVER (
              PARTITION BY campaign_id, arm, case_id, repetition, runtime_variant
              ORDER BY (state = 'scored') DESC, created_at DESC, id DESC
            ) AS duplicate_rank
       FROM local_agent_benchmark.episode
   )
   UPDATE local_agent_benchmark.charge AS charge
      SET episode_id = ranked.keep_id
     FROM ranked
    WHERE ranked.duplicate_rank > 1 AND charge.episode_id = ranked.id`,
  `WITH ranked AS (
     SELECT id,
            row_number() OVER (
              PARTITION BY campaign_id, arm, case_id, repetition, runtime_variant
              ORDER BY (state = 'scored') DESC, created_at DESC, id DESC
            ) AS duplicate_rank
       FROM local_agent_benchmark.episode
   )
   DELETE FROM local_agent_benchmark.episode AS episode
    USING ranked
    WHERE ranked.duplicate_rank > 1 AND episode.id = ranked.id`,
  `CREATE UNIQUE INDEX IF NOT EXISTS agent_benchmark_episode_identity_idx
    ON local_agent_benchmark.episode (campaign_id, arm, case_id, repetition, runtime_variant)`,
] as const;

export type Campaign = { id: string; label: string; capUsd: number; state: string };

export async function ensureLedger(pool: Pool) {
  for (const statement of LEDGER_DDL) await pool.query(statement);
}

export async function createCampaign(pool: Pool, label: string, capUsd: number): Promise<Campaign> {
  await ensureLedger(pool);
  const id = randomUUID();
  await pool.query("INSERT INTO local_agent_benchmark.campaign (id, label, cap_usd, state) VALUES ($1::uuid, $2, $3, 'active')", [id, label, capUsd]);
  return { id, label, capUsd, state: "active" };
}

export async function loadCampaign(pool: Pool, id: string): Promise<Campaign> {
  await ensureLedger(pool);
  const result = await pool.query<{ id: string; label: string; cap_usd: string; state: string }>(
    "SELECT id, label, cap_usd, state FROM local_agent_benchmark.campaign WHERE id = $1::uuid",
    [id],
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Unknown campaign ${id}.`);
  return { id: row.id, label: row.label, capUsd: Number(row.cap_usd), state: row.state };
}

export async function campaignSpendUsd(pool: Pool, campaignId: string): Promise<number> {
  const result = await pool.query<{ spent: string | null }>(
    "SELECT SUM(usd)::text AS spent FROM local_agent_benchmark.charge WHERE campaign_id = $1::uuid",
    [campaignId],
  );
  return Number(result.rows[0]?.spent ?? 0);
}

export function worstCaseEpisodeCredits(
  arm: BenchmarkArm,
  prompts: number,
): number {
  if (!Number.isSafeInteger(prompts) || prompts < 1)
    throw new Error("Episode prompt count must be a positive safe integer.");
  const credits =
    agentRoundWorstCaseCredits(arm) *
    BENCHMARK_PROVIDER_ROUNDS_PER_PROMPT *
    prompts;
  if (!Number.isSafeInteger(credits) || credits < 1)
    throw new Error(`Arm ${arm.id} produced an invalid episode credit ceiling.`);
  return credits;
}

export function worstCaseEpisodeUsd(
  arm: BenchmarkArm,
  prompts: number,
): number {
  return worstCaseEpisodeCredits(arm, prompts) * USD_PER_CREDIT;
}

export function admissionDecision(input: { capUsd: number; spentUsd: number; worstCaseUsd: number }): { admitted: boolean; headroomUsd: number } {
  const headroomUsd = input.capUsd - input.spentUsd;
  return { admitted: input.worstCaseUsd <= headroomUsd, headroomUsd };
}

export async function recordCharge(
  pool: Pool,
  campaignId: string,
  episodeId: string | null,
  kind: "turn" | "judge" | "probe",
  usd: number,
  measured: boolean,
  detail: Record<string, unknown>,
) {
  await pool.query(
    "INSERT INTO local_agent_benchmark.charge (id, campaign_id, episode_id, kind, usd, measured, detail) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::jsonb)",
    [randomUUID(), campaignId, episodeId, kind, usd, measured, JSON.stringify(detail)],
  );
}

export async function reserveCharge(
  pool: Pool,
  campaignId: string,
  episodeId: string | null,
  kind: "judge" | "probe",
  worstCaseUsd: number,
  detail: Record<string, unknown>,
): Promise<string | null> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [campaignId]);
    const result = await client.query<{ cap_usd: string; spent_usd: string }>(
      `SELECT c.cap_usd::text,
              COALESCE((SELECT SUM(ch.usd) FROM local_agent_benchmark.charge ch WHERE ch.campaign_id = c.id), 0)::text AS spent_usd
         FROM local_agent_benchmark.campaign c
        WHERE c.id = $1::uuid AND c.state = 'active'`,
      [campaignId],
    );
    const row = result.rows[0];
    if (!row || Number(row.spent_usd) + worstCaseUsd > Number(row.cap_usd)) {
      await client.query("ROLLBACK");
      return null;
    }
    const id = randomUUID();
    await client.query(
      "INSERT INTO local_agent_benchmark.charge (id, campaign_id, episode_id, kind, usd, measured, detail) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, false, $6::jsonb)",
      [id, campaignId, episodeId, kind, worstCaseUsd, JSON.stringify({ ...detail, reserved: true })],
    );
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function settleReservedCharge(
  pool: Pool,
  chargeId: string,
  usd: number,
  detail: Record<string, unknown>,
) {
  await pool.query(
    "UPDATE local_agent_benchmark.charge SET usd = $2, measured = true, detail = $3::jsonb WHERE id = $1::uuid",
    [chargeId, usd, JSON.stringify(detail)],
  );
}

export async function registerEpisode(
  pool: Pool,
  input: {
    campaignId: string;
    arm: string;
    caseId: string;
    repetition: number;
    runtimeVariant: string;
    namespace: string;
    companyId: string;
    actorUserId: string;
  },
): Promise<string> {
  const id = randomUUID();
  const result = await pool.query<{ id: string }>(
    `INSERT INTO local_agent_benchmark.episode (id, campaign_id, arm, case_id, repetition, runtime_variant, namespace, company_id, actor_user_id, state)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::uuid, $9::uuid, 'prepared')
     ON CONFLICT (campaign_id, arm, case_id, repetition, runtime_variant)
     DO UPDATE SET namespace = EXCLUDED.namespace,
                   company_id = EXCLUDED.company_id,
                   actor_user_id = EXCLUDED.actor_user_id,
                   state = 'prepared',
                   reason = NULL,
                   artifact_path = NULL,
                   finished_at = NULL
     WHERE local_agent_benchmark.episode.state = 'failed'
     RETURNING id::text`,
    [id, input.campaignId, input.arm, input.caseId, input.repetition, input.runtimeVariant, input.namespace, input.companyId, input.actorUserId],
  );
  const row = result.rows[0];
  if (!row)
    throw new Error(
      `Episode ${input.arm}/${input.caseId}/r${input.repetition}/${input.runtimeVariant} already exists and is not retryable.`,
    );
  return row.id;
}

export async function updateEpisode(pool: Pool, id: string, state: "running" | "scored" | "failed" | "skipped", reason: string | null, artifactPath: string | null) {
  await pool.query(
    "UPDATE local_agent_benchmark.episode SET state = $2, reason = $3, artifact_path = $4, finished_at = CASE WHEN $2 IN ('scored','failed','skipped') THEN now() ELSE finished_at END WHERE id = $1::uuid",
    [id, state, reason, artifactPath],
  );
}

export async function completeEpisode(
  pool: Pool,
  id: string,
  state: "scored" | "skipped",
  reason: string | null,
  artifactPath: string,
) {
  const result = await pool.query(
    `UPDATE local_agent_benchmark.episode
        SET state = $2,
            reason = $3,
            artifact_path = $4,
            finished_at = now()
      WHERE id = $1::uuid
        AND state IN ('prepared', 'running')
      RETURNING id`,
    [id, state, reason, artifactPath],
  );
  if (result.rowCount !== 1)
    throw new Error(
      `Benchmark episode ${id} is no longer eligible for terminal completion.`,
    );
}

export async function recoverInterruptedEpisode(
  pool: Pool,
  input: {
    campaignId: string;
    arm: string;
    caseId: string;
    repetition: number;
    runtimeVariant: string;
  },
): Promise<{ id: string; previousState: "prepared" | "running" }> {
  if (!Number.isSafeInteger(input.repetition) || input.repetition < 1)
    throw new Error("Episode repetition must be a positive safe integer.");
  for (const [name, value] of Object.entries({
    campaign: input.campaignId,
    arm: input.arm,
    case: input.caseId,
    variant: input.runtimeVariant,
  }))
    if (!value.trim()) throw new Error(`Episode ${name} must be nonempty.`);

  await ensureLedger(pool);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const episodeResult = await client.query<{
      id: string;
      company_id: string;
      actor_user_id: string;
      state: string;
    }>(
      `SELECT id::text, company_id::text, actor_user_id::text, state
         FROM local_agent_benchmark.episode
        WHERE campaign_id = $1::uuid
          AND arm = $2
          AND case_id = $3
          AND repetition = $4
          AND runtime_variant = $5
        FOR UPDATE`,
      [
        input.campaignId,
        input.arm,
        input.caseId,
        input.repetition,
        input.runtimeVariant,
      ],
    );
    const episode = episodeResult.rows[0];
    const label = `${input.runtimeVariant}/${input.arm}/${input.caseId}/r${input.repetition}`;
    if (!episode) throw new Error(`Unknown benchmark episode ${label}.`);
    if (episode.state !== "prepared" && episode.state !== "running")
      throw new Error(
        `Benchmark episode ${label} is ${episode.state}; only prepared or running episodes can be recovered.`,
      );

    // Recovery is an explicit operator action. Brief SHARE locks make the
    // absence check atomic with marking the ledger row retryable: any product
    // process that is inserting, updating or deleting a turn or lease must
    // finish before the check, and cannot start another write until commit.
    await client.query(
      'LOCK TABLE "AgentTurnRequest", "AgentRunLease" IN SHARE MODE',
    );
    const liveResult = await client.query<{
      live_turn: boolean;
      live_lease: boolean;
    }>(
      `SELECT
         EXISTS (
           SELECT 1
             FROM "AgentTurnRequest"
            WHERE "companyId" = $1::text
              AND "userId" = $2::text
              AND "status" NOT IN ('completed', 'failed', 'uncertain')
         ) AS live_turn,
         EXISTS (
           SELECT 1
             FROM "AgentRunLease"
            WHERE "companyId" = $1::text
              AND "userId" = $2::text
         ) AS live_lease`,
      [episode.company_id, episode.actor_user_id],
    );
    const live = liveResult.rows[0];
    if (live?.live_turn || live?.live_lease) {
      const blockers = [
        live.live_turn ? "a nonterminal agent turn" : null,
        live.live_lease ? "an agent run lease" : null,
      ].filter((value): value is string => value !== null);
      throw new Error(
        `Benchmark episode ${label} still has ${blockers.join(" and ")}; recovery refused.`,
      );
    }

    await client.query(
      `UPDATE local_agent_benchmark.episode
          SET state = 'failed',
              reason = 'explicit recovery after interruption',
              finished_at = now()
        WHERE id = $1::uuid`,
      [episode.id],
    );
    await client.query("COMMIT");
    return { id: episode.id, previousState: episode.state };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function existingEpisode(pool: Pool, campaignId: string, arm: string, caseId: string, repetition: number, runtimeVariant: string) {
  const result = await pool.query<{ id: string; state: string; artifact_path: string | null }>(
    "SELECT id, state, artifact_path FROM local_agent_benchmark.episode WHERE campaign_id = $1::uuid AND arm = $2 AND case_id = $3 AND repetition = $4 AND runtime_variant = $5",
    [campaignId, arm, caseId, repetition, runtimeVariant],
  );
  return result.rows[0] ?? null;
}

export async function campaignEpisodes(pool: Pool, campaignId: string) {
  const result = await pool.query<{ id: string; arm: string; case_id: string; repetition: number; runtime_variant: string; state: string; reason: string | null; artifact_path: string | null }>(
    "SELECT id, arm, case_id, repetition, runtime_variant, state, reason, artifact_path FROM local_agent_benchmark.episode WHERE campaign_id = $1::uuid ORDER BY created_at",
    [campaignId],
  );
  return result.rows;
}
