export type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
};

const PRICING: Record<string, ModelPricing> = {
  "gpt-5.6-luna": { inputPerMTok: 0.2, outputPerMTok: 1.2, cacheReadPerMTok: 0.02, cacheWritePerMTok: 0.25 },
};

const UNKNOWN_MODEL_PRICING: ModelPricing = {
  inputPerMTok: 10,
  outputPerMTok: 50,
  cacheReadPerMTok: 1,
  cacheWritePerMTok: 20,
};

export function resolveModelPricing(model: string) {
  const exact = PRICING[model];
  if (exact) return exact;

  const family = Object.keys(PRICING).find((key) => model.startsWith(key));
  return family ? PRICING[family] : UNKNOWN_MODEL_PRICING;
}

export type TokenCounts = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export function assertValidTokenCounts(tokens: TokenCounts) {
  for (const [name, value] of Object.entries(tokens))
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid ${name} reported by the AI provider.`);
}

export function computeCostMicrocents(model: string, tokens: TokenCounts) {
  assertValidTokenCounts(tokens);
  const pricing = resolveModelPricing(model);

  return Math.round(
    tokens.inputTokens * pricing.inputPerMTok * 100 +
      tokens.outputTokens * pricing.outputPerMTok * 100 +
      tokens.cacheReadTokens * pricing.cacheReadPerMTok * 100 +
      tokens.cacheWriteTokens * pricing.cacheWritePerMTok * 100,
  );
}

export function usdToMicrocents(usd: number) {
  return Math.round(usd * 100_000_000);
}

export function microcentsToUsd(microcents: number) {
  return microcents / 100_000_000;
}
