import type { Pool } from "pg";

import type { EpisodeArtifact } from "./episode";

import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";

import { reserveCharge, settleReservedCharge } from "./campaign";

const GATEWAY_CHAT_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MICROCENTS_PER_USD = 100_000_000;
const JUDGE_MAX_OUTPUT_TOKENS = 1200;

export const JUDGE_MODELS = [
  { id: "anthropic/claude-opus-5", provider: "bedrock", inferenceRegion: "eu" as const },
  { id: "openai/gpt-5.6-sol", provider: "azure", inferenceRegion: null },
] as const;

export const JUDGE_DIMENSIONS = ["grounding", "completeness", "reasoning", "actionability", "fabricationFree"] as const;

export type JudgeScore = {
  model: string;
  scores: Record<(typeof JUDGE_DIMENSIONS)[number], number>;
  overall: number;
  rationale: string;
  usd: number;
  raw: string;
};

export type JudgeVerdict = {
  judges: JudgeScore[];
  mean: number | null;
  disagreement: boolean;
  judgedAt: string;
  unavailable?: string[];
};

export type JudgeProgressCheckpoint = (
  verdict: JudgeVerdict,
) => Promise<void>;

function rubricPrompt(artifact: EpisodeArtifact) {
  const answers = artifact.observed.map((turn, index) => `--- Assistant answer to request ${index + 1} ---\n${turn.text.trim() || "(empty)"}`).join("\n\n");
  const requests = artifact.prompts.map((prompt, index) => `--- User request ${index + 1} ---\n${prompt}`).join("\n\n");
  const facts = artifact.judgeFacts.length ? artifact.judgeFacts.map((fact) => `- ${fact}`).join("\n") : "- (no expected facts supplied; judge on internal consistency and grounding in the tools used)";
  const tools = [...new Set(artifact.observed.flatMap((turn) => turn.tools.map((tool) => tool.name)))].join(", ") || "(none)";
  return [
    "You grade the final answers of a CRM assistant. You do not know which model produced them. Grade only what is written.",
    "Score each dimension from 1 (poor) to 5 (excellent):",
    "grounding: every stated fact matches the expected facts or the tools used; completeness: everything the request asked for is covered; reasoning: conclusions follow from the evidence with clear, correct logic; actionability: a business user could act on it directly; fabricationFree: nothing invented, no hedged guesses presented as facts (5 = nothing invented).",
    "Return exactly one JSON object: {\"grounding\":n,\"completeness\":n,\"reasoning\":n,\"actionability\":n,\"fabricationFree\":n,\"rationale\":\"two sentences\"}",
    "",
    `Task title: ${artifact.title}`,
    requests,
    "",
    "Expected facts (ground truth):",
    facts,
    "",
    `Tools the assistant called: ${tools}`,
    "",
    answers,
  ].join("\n");
}

function parseScores(raw: string): { scores: JudgeScore["scores"]; rationale: string } | null {
  const match = raw.match(/\{[\s\S]*\}?/);
  if (!match) return null;
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(match[0]) as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  const scoreOf = (dimension: string): number => {
    if (parsed) return Number(parsed[dimension]);
    const field = raw.match(new RegExp(`"${dimension}"\\s*:\\s*([1-5])`));
    return field ? Number(field[1]) : Number.NaN;
  };
  const entries = JUDGE_DIMENSIONS.map((dimension) => [dimension, scoreOf(dimension)] as const);
  if (entries.some(([, value]) => !Number.isInteger(value) || value < 1 || value > 5)) return null;
  const rationale = parsed ? String(parsed.rationale ?? "") : (raw.match(/"rationale"\s*:\s*"([\s\S]*)$/)?.[1] ?? "").replace(/"?\s*\}?\s*$/, "");
  return { scores: Object.fromEntries(entries) as JudgeScore["scores"], rationale };
}

const JUDGE_TIMEOUT_MS = 180_000;

const JUDGE_RETRY_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const JUDGE_ZERO_COST_REJECTION_STATUSES = new Set([
  400, 401, 402, 403, 404, 405, 409, 422, 429,
]);

const JUDGE_MAX_ATTEMPTS = Number(process.env.JUDGE_MAX_ATTEMPTS ?? 7);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type JudgeCost =
  | { certainty: "measured"; usd: number }
  | { certainty: "uncertain" }
  | { certainty: "zero" };

class JudgeCallError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly cost: JudgeCost,
  ) {
    super(message);
    this.name = "JudgeCallError";
  }
}

type JudgeCallResult = { score: JudgeScore; cost: JudgeCost };

function normalizeJudgeError(error: unknown): JudgeCallError {
  if (error instanceof JudgeCallError) return error;
  return new JudgeCallError(
    error instanceof Error ? error.message : String(error),
    null,
    { certainty: "uncertain" },
  );
}

async function askJudge(apiKey: string, model: (typeof JUDGE_MODELS)[number], prompt: string): Promise<JudgeCallResult> {
  let lastError: JudgeCallError | null = null;
  let encounteredUncertainCost = false;
  for (let attempt = 1; attempt <= JUDGE_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await askJudgeOnce(apiKey, model, prompt);
      if (encounteredUncertainCost || result.cost.certainty === "uncertain")
        return { score: result.score, cost: { certainty: "uncertain" } };
      return result;
    } catch (rawError) {
      const error = normalizeJudgeError(rawError);
      lastError = error;
      if (error.cost.certainty === "uncertain") encounteredUncertainCost = true;
      if (!JUDGE_RETRY_STATUSES.has(error.status ?? 0) || attempt === JUDGE_MAX_ATTEMPTS) {
        if (encounteredUncertainCost && error.cost.certainty !== "uncertain")
          throw new JudgeCallError(error.message, error.status, {
            certainty: "uncertain",
          });
        throw error;
      }
      await wait(Math.min(120_000, 5_000 * attempt * attempt));
    }
  }
  throw lastError ?? new JudgeCallError("Judge call failed", null, { certainty: "uncertain" });
}

async function askJudgeOnce(apiKey: string, model: (typeof JUDGE_MODELS)[number], prompt: string): Promise<JudgeCallResult> {
  const response = await fetch(GATEWAY_CHAT_URL, {
    method: "POST",
    signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: "user", content: prompt }],
      max_tokens: JUDGE_MAX_OUTPUT_TOKENS,
      temperature: 0,
      providerOptions: { gateway: { only: [model.provider], zeroDataRetention: true, disallowPromptTraining: true } },
    }),
  });
  if (!response.ok)
    throw new JudgeCallError(
      `Judge ${model.id} returned ${response.status}: ${(await response.text()).slice(0, 300)}`,
      response.status,
      JUDGE_ZERO_COST_REJECTION_STATUSES.has(response.status)
        ? { certainty: "zero" }
        : { certainty: "uncertain" },
    );
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const raw = body.choices?.[0]?.message?.content ?? "";
  const hasMeasuredUsage =
    typeof body.usage?.prompt_tokens === "number" &&
    typeof body.usage?.completion_tokens === "number";
  const promptTokens = body.usage?.prompt_tokens ?? 0;
  const cached = body.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const microcents = computeCostMicrocents(
    model.id,
    { inputTokens: Math.max(0, promptTokens - cached), outputTokens: body.usage?.completion_tokens ?? 0, cacheReadTokens: cached, cacheWriteTokens: 0 },
    model.provider,
    model.inferenceRegion,
  );
  const usd = microcents / MICROCENTS_PER_USD;
  const parsed = parseScores(raw);
  if (!parsed)
    throw new JudgeCallError(
      `Judge ${model.id} returned no parseable scores: ${raw.slice(0, 200)}`,
      null,
      hasMeasuredUsage
        ? { certainty: "measured", usd }
        : { certainty: "uncertain" },
    );
  const overall = JUDGE_DIMENSIONS.reduce((total, dimension) => total + parsed.scores[dimension], 0) / JUDGE_DIMENSIONS.length;
  return {
    score: { model: model.id, scores: parsed.scores, overall, rationale: parsed.rationale, usd, raw },
    cost: hasMeasuredUsage
      ? { certainty: "measured", usd }
      : { certainty: "uncertain" },
  };
}

export function judgeVerdictIsComplete(verdict: JudgeVerdict | undefined): boolean {
  if (verdict === undefined || (verdict.unavailable?.length ?? 0) > 0) return false;
  const expected = new Set(JUDGE_MODELS.map((model) => model.id));
  const present = new Set(verdict.judges.map((judge) => judge.model));
  return (
    verdict.judges.length === expected.size &&
    present.size === expected.size &&
    [...expected].every((model) => present.has(model))
  );
}

function verdictFromProgress(
  judges: readonly JudgeScore[],
  unavailable: readonly string[],
): JudgeVerdict {
  const overalls = judges.map((judge) => judge.overall);
  const mean = overalls.length
    ? overalls.reduce((total, value) => total + value, 0) / overalls.length
    : null;
  const disagreement =
    overalls.length > 1 && Math.max(...overalls) - Math.min(...overalls) > 1;
  return {
    judges: [...judges],
    mean,
    disagreement,
    judgedAt: new Date().toISOString(),
    ...(unavailable.length ? { unavailable: [...unavailable] } : {}),
  };
}

export async function judgeArtifact(
  pool: Pool,
  apiKey: string,
  artifact: EpisodeArtifact,
  checkpoint?: JudgeProgressCheckpoint,
): Promise<JudgeVerdict> {
  const prompt = rubricPrompt(artifact);
  const judges: JudgeScore[] = [...(artifact.judge?.judges ?? [])];
  const unavailable: string[] = [];
  for (const model of JUDGE_MODELS) {
    if (judges.some((judge) => judge.model === model.id)) continue;
    const conservativeInputTokens = new TextEncoder().encode(prompt).length;
    const worstCaseUsd =
      (computeCostMicrocents(
        model.id,
        {
          inputTokens: conservativeInputTokens,
          outputTokens: JUDGE_MAX_OUTPUT_TOKENS,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        model.provider,
        model.inferenceRegion,
      ) /
        MICROCENTS_PER_USD) *
      JUDGE_MAX_ATTEMPTS;
    const reservationId = await reserveCharge(
      pool,
      artifact.campaignId,
      artifact.episodeId,
      "judge",
      worstCaseUsd,
      { model: model.id, worstCaseAttempts: JUDGE_MAX_ATTEMPTS },
    );
    if (!reservationId) {
      unavailable.push(model.id);
      console.log(
        `judge ${model.id} unavailable for ${artifact.caseId} r${artifact.repetition}: campaign cap cannot admit the call`,
      );
      await checkpoint?.(verdictFromProgress(judges, unavailable));
      continue;
    }
    let result: JudgeCallResult;
    try {
      result = await askJudge(apiKey, model, prompt);
    } catch (rawError) {
      const error = normalizeJudgeError(rawError);
      if (error.cost.certainty !== "uncertain")
        await settleReservedCharge(
          pool,
          reservationId,
          error.cost.certainty === "measured" ? error.cost.usd : 0,
          {
            model: model.id,
            reservedWorstCaseUsd: worstCaseUsd,
            failed: true,
            error: error.message.slice(0, 300),
          },
        );
      unavailable.push(model.id);
      console.log(`judge ${model.id} unavailable for ${artifact.caseId} r${artifact.repetition}: ${error.message.slice(0, 120)}`);
      await checkpoint?.(verdictFromProgress(judges, unavailable));
      continue;
    }
    const score = result.score;
    const progress = verdictFromProgress([...judges, score], unavailable);
    await checkpoint?.(progress);
    judges.push(score);
    if (result.cost.certainty === "measured")
      await settleReservedCharge(pool, reservationId, result.cost.usd, {
        model: model.id,
        reservedWorstCaseUsd: worstCaseUsd,
      });
  }
  if (judges.length === 0) throw new Error(`no judge answered for ${artifact.caseId} r${artifact.repetition}`);
  return verdictFromProgress(judges, unavailable);
}
