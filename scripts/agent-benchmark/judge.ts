import type { Pool } from "pg";

import type { EpisodeArtifact } from "./episode";

import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";

import { recordCharge } from "./campaign";

const GATEWAY_CHAT_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MICROCENTS_PER_USD = 100_000_000;

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

export type JudgeVerdict = { judges: JudgeScore[]; mean: number | null; disagreement: boolean; judgedAt: string };

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

async function askJudge(apiKey: string, model: (typeof JUDGE_MODELS)[number], prompt: string): Promise<JudgeScore> {
  const response = await fetch(GATEWAY_CHAT_URL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1200,
      temperature: 0,
      providerOptions: { gateway: { only: [model.provider], zeroDataRetention: true, disallowPromptTraining: true } },
    }),
  });
  if (!response.ok) throw new Error(`Judge ${model.id} returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  };
  const raw = body.choices?.[0]?.message?.content ?? "";
  const parsed = parseScores(raw);
  const promptTokens = body.usage?.prompt_tokens ?? 0;
  const cached = body.usage?.prompt_tokens_details?.cached_tokens ?? 0;
  const microcents = computeCostMicrocents(
    model.id,
    { inputTokens: Math.max(0, promptTokens - cached), outputTokens: body.usage?.completion_tokens ?? 0, cacheReadTokens: cached, cacheWriteTokens: 0 },
    model.provider,
    model.inferenceRegion,
  );
  if (!parsed) throw new Error(`Judge ${model.id} returned no parseable scores: ${raw.slice(0, 200)}`);
  const overall = JUDGE_DIMENSIONS.reduce((total, dimension) => total + parsed.scores[dimension], 0) / JUDGE_DIMENSIONS.length;
  return { model: model.id, scores: parsed.scores, overall, rationale: parsed.rationale, usd: microcents / MICROCENTS_PER_USD, raw };
}

export async function judgeArtifact(pool: Pool, apiKey: string, artifact: EpisodeArtifact): Promise<JudgeVerdict> {
  const prompt = rubricPrompt(artifact);
  const judges: JudgeScore[] = [];
  for (const model of JUDGE_MODELS) {
    const score = await askJudge(apiKey, model, prompt);
    judges.push(score);
    await recordCharge(pool, artifact.campaignId, artifact.episodeId, "judge", score.usd, false, { model: model.id });
  }
  const overalls = judges.map((judge) => judge.overall);
  const mean = overalls.length ? overalls.reduce((total, value) => total + value, 0) / overalls.length : null;
  const disagreement = overalls.length > 1 && Math.max(...overalls) - Math.min(...overalls) > 1;
  return { judges, mean, disagreement, judgedAt: new Date().toISOString() };
}
