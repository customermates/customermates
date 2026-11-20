export const AGENT_PROVIDERS = ["anthropic", "openai", "google"] as const;
export type AgentProviderId = (typeof AGENT_PROVIDERS)[number];

export type AgentProviderModel = {
  id: string;
  label: string;
  contextWindow: number;
};

export const AGENT_PROVIDER_MODELS: Record<AgentProviderId, readonly AgentProviderModel[]> = {
  anthropic: [
    { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", contextWindow: 200_000 },
    { id: "claude-opus-5-5", label: "Claude Opus 5.5", contextWindow: 200_000 },
    { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", contextWindow: 200_000 },
    { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", contextWindow: 200_000 },
    { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", contextWindow: 200_000 },
  ],
  openai: [
    { id: "gpt-5", label: "GPT-5", contextWindow: 400_000 },
    { id: "gpt-5-mini", label: "GPT-5 mini", contextWindow: 400_000 },
    { id: "gpt-5-nano", label: "GPT-5 nano", contextWindow: 400_000 },
    { id: "gpt-4.1", label: "GPT-4.1", contextWindow: 1_047_576 },
    { id: "gpt-4.1-mini", label: "GPT-4.1 mini", contextWindow: 1_047_576 },
  ],
  google: [
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", contextWindow: 1_048_576 },
    { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", contextWindow: 1_048_576 },
    { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash-Lite", contextWindow: 1_048_576 },
  ],
};

export const AGENT_PROVIDER_DEFAULT_MODEL: Record<AgentProviderId, string> = {
  anthropic: "claude-sonnet-5-5",
  openai: "gpt-5-mini",
  google: "gemini-2.5-flash",
};

export function isAgentProvider(value: string): value is AgentProviderId {
  return (AGENT_PROVIDERS as readonly string[]).includes(value);
}

export function agentProviderModels(provider: AgentProviderId): readonly AgentProviderModel[] {
  return AGENT_PROVIDER_MODELS[provider];
}

export function agentProviderOfModel(modelId: string): AgentProviderId | null {
  return AGENT_PROVIDERS.find((provider) => isListedAgentProviderModel(provider, modelId)) ?? null;
}

export function isListedAgentProviderModel(provider: AgentProviderId, modelId: string): boolean {
  return AGENT_PROVIDER_MODELS[provider].some((model) => model.id === modelId);
}

export type AgentProviderModelChoice = { modelId: string; retiredDefault: string | null };

export function chooseAgentProviderModel(
  provider: AgentProviderId,
  requested: string | null | undefined,
  keyDefault: string | null | undefined,
): AgentProviderModelChoice {
  if (requested) return { modelId: requested, retiredDefault: null };
  if (keyDefault && isListedAgentProviderModel(provider, keyDefault))
    return { modelId: keyDefault, retiredDefault: null };
  return { modelId: AGENT_PROVIDER_DEFAULT_MODEL[provider], retiredDefault: keyDefault || null };
}

export type AgentStepProvider =
  | { ok: true; provider: AgentProviderId }
  | { ok: false; reason: "modelUnavailable" | "modelRequired" | "noKey" };

export function agentStepProvider(
  keyProviders: readonly AgentProviderId[],
  requested: string | null | undefined,
): AgentStepProvider {
  if (requested) {
    const provider = agentProviderOfModel(requested);
    if (!provider) return { ok: false, reason: "modelUnavailable" };
    return keyProviders.includes(provider) ? { ok: true, provider } : { ok: false, reason: "noKey" };
  }
  if (keyProviders.length === 0) return { ok: false, reason: "noKey" };
  if (keyProviders.length > 1) return { ok: false, reason: "modelRequired" };
  return { ok: true, provider: keyProviders[0] };
}
