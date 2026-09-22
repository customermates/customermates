import type { AgentThinkingLevel } from "./model-catalog";

export type AgentThinkingProviderOptions = Record<string, { thinkingConfig: { thinkingLevel: AgentThinkingLevel } }>;

const GOOGLE_PROVIDER_OPTION_KEYS: Record<string, string> = {
  vertex: "vertex",
  google: "google",
};

export function googleThinkingProviderOptions(budget: {
  servingProvider: string;
  thinkingLevel?: AgentThinkingLevel;
}): AgentThinkingProviderOptions {
  if (!budget.thinkingLevel) return {};
  const provider = GOOGLE_PROVIDER_OPTION_KEYS[budget.servingProvider];
  if (!provider) return {};
  return { [provider]: { thinkingConfig: { thinkingLevel: budget.thinkingLevel } } };
}
