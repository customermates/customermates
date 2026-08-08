export type ModelPricing = {
  inputPerMTok: number;
  outputPerMTok: number;
  cacheReadPerMTok: number;
  cacheWritePerMTok: number;
};

const PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-5": { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75 },
  "claude-sonnet-4-6": { inputPerMTok: 3, outputPerMTok: 15, cacheReadPerMTok: 0.3, cacheWritePerMTok: 3.75 },
  "claude-opus-4-8": { inputPerMTok: 5, outputPerMTok: 25, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 },
  "claude-opus-4-7": { inputPerMTok: 5, outputPerMTok: 25, cacheReadPerMTok: 0.5, cacheWritePerMTok: 6.25 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5, cacheReadPerMTok: 0.1, cacheWritePerMTok: 1.25 },
  "gemini-2.5-flash": { inputPerMTok: 0.3, outputPerMTok: 2.5, cacheReadPerMTok: 0.03, cacheWritePerMTok: 0.3 },
  "gemini-2.5-flash-lite": { inputPerMTok: 0.1, outputPerMTok: 0.4, cacheReadPerMTok: 0.01, cacheWritePerMTok: 0.1 },
  "gemini-3.1-flash-lite": { inputPerMTok: 0.25, outputPerMTok: 1.5, cacheReadPerMTok: 0.025, cacheWritePerMTok: 0.25 },
  "gpt-5-mini": { inputPerMTok: 0.25, outputPerMTok: 2, cacheReadPerMTok: 0.025, cacheWritePerMTok: 0.25 },
  "gpt-5-nano": { inputPerMTok: 0.05, outputPerMTok: 0.4, cacheReadPerMTok: 0.005, cacheWritePerMTok: 0.05 },
  "gpt-5.6-sol": { inputPerMTok: 5, outputPerMTok: 30, cacheReadPerMTok: 0.5, cacheWritePerMTok: 5 },
  "gpt-5.6-terra": { inputPerMTok: 2, outputPerMTok: 12, cacheReadPerMTok: 0.2, cacheWritePerMTok: 2 },
  "gpt-5.6-luna": { inputPerMTok: 0.2, outputPerMTok: 1.2, cacheReadPerMTok: 0.02, cacheWritePerMTok: 0.2 },
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
