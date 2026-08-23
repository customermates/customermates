import { z } from "zod";

import { MODEL_PRICING_SNAPSHOT } from "./model-pricing.snapshot";

const UsdRateSchema = z
  .string()
  .regex(/^\d+(\.\d+)?$/, "Pricing rates must be decimal strings from the gateway catalog.");

const TierSchema = z.object({
  costUsdPerToken: UsdRateSchema,
  minPromptTokens: z.number().int().nonnegative().optional(),
  maxPromptTokens: z.number().int().positive().optional(),
});

const EndpointSchema = z.object({
  modelId: z.string().min(1),
  providerNativeModelId: z.string().min(1),
  provider: z.string().min(1),
  contextLength: z.number().int().positive(),
  maxCompletionTokens: z.number().int().positive().nullable(),
  requestUsd: UsdRateSchema,
  webSearchUsdPerThousandCalls: UsdRateSchema,
  prompt: z.array(TierSchema).min(1),
  completion: z.array(TierSchema).min(1),
  inputCacheRead: z.array(TierSchema).min(1),
  inputCacheWrite: z.array(TierSchema).min(1),
});

const SnapshotSchema = z.object({
  source: z.string().min(1),
  fetchedAt: z.string().min(1),
  endpoints: z.array(EndpointSchema).min(1),
});

const SNAPSHOT = SnapshotSchema.parse(MODEL_PRICING_SNAPSHOT);

export type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
};

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

type Tier = z.infer<typeof TierSchema>;
type Endpoint = z.infer<typeof EndpointSchema>;

const MICROCENTS_PER_USD = 100_000_000;
const RATE_SCALE_DECIMALS = 12;
const RATE_SCALE_PER_MICROCENT = 10_000;
const RATE_SCALE_PER_MILLION_TOKENS = 1_000_000;

function scaledRatePerToken(rate: string) {
  const [whole, fraction = ""] = rate.split(".");
  if (fraction.length > RATE_SCALE_DECIMALS)
    throw new Error(`Pricing rate "${rate}" carries more precision than the ledger can represent exactly.`);

  return Number(`${whole}${fraction.padEnd(RATE_SCALE_DECIMALS, "0")}`);
}

function tierLowerBound(tier: Tier) {
  return tier.minPromptTokens ?? 0;
}

function tierUpperBound(tier: Tier) {
  return tier.maxPromptTokens ?? Number.POSITIVE_INFINITY;
}

function selectTier(tiers: readonly Tier[], promptTokens: number) {
  const match = tiers.find((tier) => promptTokens >= tierLowerBound(tier) && promptTokens < tierUpperBound(tier));
  if (!match) throw new Error(`No pricing tier covers ${promptTokens} prompt tokens.`);
  return match;
}

function usdPerMillionTokens(tier: Tier) {
  return scaledRatePerToken(tier.costUsdPerToken) / RATE_SCALE_PER_MILLION_TOKENS;
}

function findEndpoint(model: string, provider?: string) {
  const matches = SNAPSHOT.endpoints.filter(
    (endpoint) =>
      (endpoint.modelId === model || endpoint.providerNativeModelId === model) &&
      (provider === undefined || endpoint.provider === provider),
  );
  if (matches.length === 0) {
    throw new Error(
      `No pinned pricing for model "${model}"${provider ? ` on provider "${provider}"` : ""}. Add it to the pricing snapshot before serving it.`,
    );
  }
  if (matches.length > 1)
    throw new Error(`Pinned pricing for model "${model}" is ambiguous across providers. Pass an explicit provider.`);
  return matches[0];
}

export function resolveModelPricing(model: string, promptTokens = 0, provider?: string): ModelPricing {
  if (!Number.isSafeInteger(promptTokens) || promptTokens < 0)
    throw new Error("Prompt token count must be a non-negative whole number.");

  const endpoint = findEndpoint(model, provider);

  return {
    inputPerMTok: usdPerMillionTokens(selectTier(endpoint.prompt, promptTokens)),
    outputPerMTok: usdPerMillionTokens(selectTier(endpoint.completion, promptTokens)),
    cacheReadPerMTok: usdPerMillionTokens(selectTier(endpoint.inputCacheRead, promptTokens)),
    cacheWritePerMTok: usdPerMillionTokens(selectTier(endpoint.inputCacheWrite, promptTokens)),
  };
}

export function modelPromptTierBoundaries(model: string, provider?: string): number[] {
  const endpoint = findEndpoint(model, provider);
  const dimensions: (keyof Pick<Endpoint, "prompt" | "completion" | "inputCacheRead" | "inputCacheWrite">)[] = [
    "prompt",
    "completion",
    "inputCacheRead",
    "inputCacheWrite",
  ];
  const boundaries = dimensions
    .flatMap((dimension) => endpoint[dimension].map(tierLowerBound))
    .filter((boundary) => boundary > 0);

  return [...new Set(boundaries)].sort((a, b) => a - b);
}

export function lowestModelPromptTierBoundary(model: string, provider?: string): number | null {
  return modelPromptTierBoundaries(model, provider)[0] ?? null;
}

export function pinnedModelEndpoints() {
  return SNAPSHOT.endpoints.map((endpoint) => ({ modelId: endpoint.modelId, provider: endpoint.provider }));
}

export function assertValidTokenCounts(tokens: TokenCounts) {
  for (const [name, value] of Object.entries(tokens))
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name} reported by the AI provider.`);
}

export function promptTokensOf(tokens: TokenCounts) {
  return tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens;
}

export function computeCostMicrocents(model: string, tokens: TokenCounts, provider?: string) {
  assertValidTokenCounts(tokens);
  const promptTokens = promptTokensOf(tokens);
  const endpoint = findEndpoint(model, provider);
  const rate = (dimension: readonly Tier[]) => scaledRatePerToken(selectTier(dimension, promptTokens).costUsdPerToken);

  const scaled =
    tokens.inputTokens * rate(endpoint.prompt) +
    tokens.outputTokens * rate(endpoint.completion) +
    tokens.cacheReadTokens * rate(endpoint.inputCacheRead) +
    tokens.cacheWriteTokens * rate(endpoint.inputCacheWrite);

  return Math.round(scaled / RATE_SCALE_PER_MICROCENT);
}

export function usdToMicrocents(usd: number) {
  return Math.round(usd * MICROCENTS_PER_USD);
}

export function microcentsToUsd(microcents: number) {
  return microcents / MICROCENTS_PER_USD;
}
