import type { AgentModelEntry, AgentReasoningEffort } from "./agent-model";

export const OVH_SERVING_PROVIDER = "ovh";
export const OVH_MODEL_ID_PREFIX = "ovh/";
export const OVH_AI_ENDPOINTS_BASE_URL = "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1";
export const OVH_AI_ENDPOINTS_MODELS_URL = `${OVH_AI_ENDPOINTS_BASE_URL}/models`;

export const OVH_AI_ENDPOINTS_ATTESTATION = {
  source: "https://www.ovhcloud.com/en/public-cloud/ai-endpoints/",
  inferenceRegion: "eu",
  location: "Gravelines, France",
  zeroDataRetention: true,
  noPromptTraining: true,
  verifiedAt: "2026-10-04",
} as const;

type OvhModelCapabilities = {
  reasoningEfforts: readonly AgentReasoningEffort[];
};

export const OVH_AI_ENDPOINTS_MODELS: Readonly<Record<string, OvhModelCapabilities>> = {
  "gpt-oss-120b": { reasoningEfforts: ["low", "medium", "high"] },
  "Qwen3.8-27B": { reasoningEfforts: [] },
  "Qwen3.5-397B-A17B": { reasoningEfforts: [] },
  "Mistral-Small-3.2-24B-Instruct-2506": { reasoningEfforts: [] },
  "Qwen3-Coder-30B-A3B-Instruct": { reasoningEfforts: [] },
};

export function isOvhModelId(modelId: string): boolean {
  return modelId.startsWith(OVH_MODEL_ID_PREFIX);
}

export function ovhNativeModelId(modelId: string): string {
  if (!isOvhModelId(modelId)) throw new Error(`Model "${modelId}" is not an OVHcloud AI Endpoints model id.`);
  const nativeModelId = modelId.slice(OVH_MODEL_ID_PREFIX.length);
  if (!Object.hasOwn(OVH_AI_ENDPOINTS_MODELS, nativeModelId))
    throw new Error(`OVHcloud AI Endpoints model "${nativeModelId}" is not in the audited model list.`);
  return nativeModelId;
}

export function agentServingProviderUsesGateway(servingProvider: string): boolean {
  return servingProvider !== OVH_SERVING_PROVIDER;
}

export function assertOvhModelEntry(label: string, entry: AgentModelEntry) {
  const ovhId = isOvhModelId(entry.modelId);
  const ovhProvider = entry.servingProvider === OVH_SERVING_PROVIDER;
  if (!ovhId && !ovhProvider) return;
  if (ovhId !== ovhProvider) {
    throw new Error(
      `Agent model "${label}" must pair an "${OVH_MODEL_ID_PREFIX}" model id with serving provider "${OVH_SERVING_PROVIDER}".`,
    );
  }

  const capabilities = OVH_AI_ENDPOINTS_MODELS[ovhNativeModelId(entry.modelId)];
  if (entry.inferenceRegion !== OVH_AI_ENDPOINTS_ATTESTATION.inferenceRegion)
    throw new Error(`Agent model "${label}" must declare inference region "eu" for OVHcloud AI Endpoints.`);
  if (entry.thinkingLevel !== undefined)
    throw new Error(`Agent model "${label}" sets a thinking level, which OVHcloud AI Endpoints does not accept.`);
  if (entry.reasoningEffort !== undefined && !capabilities.reasoningEfforts.includes(entry.reasoningEffort)) {
    throw new Error(
      `Agent model "${label}" sets reasoning effort "${entry.reasoningEffort}", which "${entry.modelId}" does not accept.`,
    );
  }
}
