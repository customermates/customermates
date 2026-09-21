import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import type { BenchmarkArm } from "./arms";

import { resolveAgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";

import { benchmarkModelEntries } from "./arms";

export const USD_PER_CREDIT = 0.01;

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

export function worstCaseEpisodeUsd(arm: BenchmarkArm, prompts: number): number {
  const [entry] = benchmarkModelEntries([arm]);
  const budget = resolveAgentTurnBudget({ model: entry, availableCredits: 1_000_000 });
  if (!budget) throw new Error(`Arm ${arm.id} cannot be budgeted.`);
  return budget.reservedCredits * USD_PER_CREDIT * prompts;
}

export function admissionDecision(input: { capUsd: number; spentUsd: number; worstCaseUsd: number }): { admitted: boolean; headroomUsd: number } {
  const headroomUsd = input.capUsd - input.spentUsd;
  return { admitted: input.worstCaseUsd <= headroomUsd, headroomUsd };
}

export async function admitEpisode(pool: Pool, campaign: Campaign, arm: BenchmarkArm, prompts: number) {
  if (campaign.state !== "active") throw new Error(`Campaign ${campaign.id} is ${campaign.state}.`);
  const spentUsd = await campaignSpendUsd(pool, campaign.id);
  const worstCaseUsd = worstCaseEpisodeUsd(arm, prompts);
  const decision = admissionDecision({ capUsd: campaign.capUsd, spentUsd, worstCaseUsd });
  return { ...decision, spentUsd, worstCaseUsd };
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
  await pool.query(
    `INSERT INTO local_agent_benchmark.episode (id, campaign_id, arm, case_id, repetition, runtime_variant, namespace, company_id, actor_user_id, state)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8::uuid, $9::uuid, 'prepared')`,
    [id, input.campaignId, input.arm, input.caseId, input.repetition, input.runtimeVariant, input.namespace, input.companyId, input.actorUserId],
  );
  return id;
}

export async function updateEpisode(pool: Pool, id: string, state: "running" | "scored" | "failed" | "skipped", reason: string | null, artifactPath: string | null) {
  await pool.query(
    "UPDATE local_agent_benchmark.episode SET state = $2, reason = $3, artifact_path = $4, finished_at = CASE WHEN $2 IN ('scored','failed','skipped') THEN now() ELSE finished_at END WHERE id = $1::uuid",
    [id, state, reason, artifactPath],
  );
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
