import type { AgentModelEntry, AgentReasoningEffort, AgentThinkingLevel } from "@/ee/agent-chat/model-catalog";
import type { BenchmarkModelEntry } from "@/ee/agent-chat/benchmark-model-registry";

import { SHIPPED_AGENT_MODEL, SHIPPED_AGENT_MODEL_KEY } from "@/ee/agent-chat/model-catalog";
import { BENCHMARK_MODEL_KEY_PREFIX } from "@/ee/agent-chat/benchmark-model-registry";
import { OVH_MODEL_ID_PREFIX, OVH_SERVING_PROVIDER } from "@/ee/agent-chat/ovh-ai-endpoints-catalog";

type BenchmarkFamily =
  | "google"
  | "openai"
  | "anthropic"
  | "deepseek"
  | "zai"
  | "moonshot"
  | "mistral"
  | "alibaba"
  | "ovh";

export type BenchmarkArm = AgentModelEntry & {
  id: string;
  label: string;
  family: BenchmarkFamily;
  shipped?: boolean;
};

const ENVELOPE = { maxContextTokens: 66_000, maxToolResultChars: 6000 } as const;

const FAMILY_BY_MODEL_VENDOR = {
  google: "google",
  openai: "openai",
  anthropic: "anthropic",
  deepseek: "deepseek",
  zai: "zai",
  moonshotai: "moonshot",
  mistral: "mistral",
  alibaba: "alibaba",
  ovh: "ovh",
} as const satisfies Record<string, BenchmarkFamily>;

function benchmarkFamily(modelId: string): BenchmarkFamily {
  const vendor = modelId.split("/", 1)[0] as keyof typeof FAMILY_BY_MODEL_VENDOR;
  const family = FAMILY_BY_MODEL_VENDOR[vendor];
  if (!family) throw new Error(`No benchmark family is defined for model "${modelId}".`);
  return family;
}

function shipped(): BenchmarkArm {
  const model: AgentModelEntry = SHIPPED_AGENT_MODEL;
  return {
    id: "shipped",
    label: `${model.modelId}, ${SHIPPED_AGENT_MODEL_KEY} catalog configuration (shipped)`,
    family: benchmarkFamily(model.modelId),
    shipped: true,
    ...model,
  };
}

function google(id: string, modelId: string, thinkingLevel: AgentThinkingLevel | undefined, label: string, extra: Partial<BenchmarkArm> = {}): BenchmarkArm {
  return {
    id,
    label,
    modelId,
    servingProvider: "vertex",
    inferenceRegion: "eu",
    maxOutputTokens: thinkingLevel ? 8192 : 2048,
    ...ENVELOPE,
    ...(thinkingLevel ? { thinkingLevel } : {}),
    family: "google",
    ...extra,
  };
}

function openai(id: string, modelId: string, reasoningEffort: AgentReasoningEffort | undefined, label: string): BenchmarkArm {
  return {
    id,
    label,
    modelId,
    servingProvider: "azure",
    inferenceRegion: null,
    maxOutputTokens: 8192,
    ...ENVELOPE,
    ...(reasoningEffort ? { reasoningEffort } : {}),
    family: "openai",
  };
}

function anthropic(id: string, modelId: string, reasoningEffort: AgentReasoningEffort | undefined, label: string): BenchmarkArm {
  return {
    id,
    label,
    modelId,
    servingProvider: "bedrock",
    inferenceRegion: "eu",
    maxOutputTokens: 8192,
    ...ENVELOPE,
    ...(reasoningEffort ? { reasoningEffort } : {}),
    family: "anthropic",
  };
}

function hosted(
  id: string,
  modelId: string,
  servingProvider: string,
  family: BenchmarkArm["family"],
  reasoningEffort: AgentReasoningEffort | undefined,
  label: string,
): BenchmarkArm {
  return {
    id,
    label,
    modelId,
    servingProvider,
    inferenceRegion: null,
    maxOutputTokens: 8192,
    ...ENVELOPE,
    ...(reasoningEffort ? { reasoningEffort } : {}),
    family,
  };
}

// OVHcloud AI Endpoints arms are served directly, not through the Gateway
// (servingProvider "ovh", region "eu"). The shared envelope fits every OVH
// model's context window (131k or 262k tokens). Qwen3.x thinking models run
// with OVH's default reasoning behavior; only gpt-oss accepts reasoning_effort.
function ovh(
  id: string,
  nativeModelId: string,
  reasoningEffort: AgentReasoningEffort | undefined,
  label: string,
): BenchmarkArm {
  return {
    id,
    label,
    modelId: `${OVH_MODEL_ID_PREFIX}${nativeModelId}`,
    servingProvider: OVH_SERVING_PROVIDER,
    inferenceRegion: "eu",
    maxOutputTokens: 8192,
    ...ENVELOPE,
    ...(reasoningEffort ? { reasoningEffort } : {}),
    family: "ovh",
  };
}

export const BENCHMARK_ARMS: readonly BenchmarkArm[] = [
  shipped(),
  google("flash-lite-minimal", "google/gemini-3.5-flash-lite", "minimal", "Gemini 3.5 Flash-Lite, thinking minimal, 8192 output"),
  google("flash-lite-medium", "google/gemini-3.5-flash-lite", "medium", "Gemini 3.5 Flash-Lite, thinking medium"),
  google("flash-lite-high", "google/gemini-3.5-flash-lite", "high", "Gemini 3.5 Flash-Lite, thinking high"),
  google("flash-low", "google/gemini-3.5-flash", "low", "Gemini 3.5 Flash, thinking low"),
  google("flash-medium", "google/gemini-3.5-flash", "medium", "Gemini 3.5 Flash, thinking medium"),
  google("flash36-low", "google/gemini-3.6-flash", "low", "Gemini 3.6 Flash, thinking low"),
  google("flash38-low", "google/gemini-3.8-flash", "low", "Gemini 3.8 Flash, thinking low"),
  google("flash-lite31-low", "google/gemini-3.1-flash-lite", "low", "Gemini 3.1 Flash-Lite, thinking low"),
  openai("luna-none", "openai/gpt-5.6-luna", "none", "GPT-5.6 Luna, reasoning none"),
  openai("luna-low", "openai/gpt-5.6-luna", "low", "GPT-5.6 Luna, reasoning low"),
  openai("luna-medium", "openai/gpt-5.6-luna", "medium", "GPT-5.6 Luna, reasoning medium"),
  openai("terra-low", "openai/gpt-5.6-terra", "low", "GPT-5.6 Terra, reasoning low"),
  openai("sol-low", "openai/gpt-5.6-sol", "low", "GPT-5.6 Sol, reasoning low"),
  openai("nano-low", "openai/gpt-5-nano", "low", "GPT-5 Nano, reasoning low"),
  openai("gpt5-mini-low", "openai/gpt-5-mini", "low", "GPT-5 Mini, reasoning low"),
  openai("gpt54-mini-low", "openai/gpt-5.4-mini", "low", "GPT-5.4 Mini, reasoning low"),
  openai("gpt54-nano-low", "openai/gpt-5.4-nano", "low", "GPT-5.4 Nano, reasoning low"),
  anthropic("haiku45", "anthropic/claude-haiku-4.5", undefined, "Claude Haiku 4.5 (Bedrock EU)"),
  anthropic("sonnet5-low", "anthropic/claude-sonnet-5", "low", "Claude Sonnet 5, reasoning low (Bedrock EU)"),
  anthropic("sonnet5-medium", "anthropic/claude-sonnet-5", "medium", "Claude Sonnet 5, reasoning medium (Bedrock EU)"),
  anthropic("opus5-low", "anthropic/claude-opus-5", "low", "Claude Opus 5, reasoning low (Bedrock EU, reference)"),
  hosted("deepseek-flash-high", "deepseek/deepseek-v4-flash", "azure", "deepseek", "high", "DeepSeek V4 Flash, reasoning high (Azure)"),
  hosted("deepseek-pro-high", "deepseek/deepseek-v4-pro", "azure", "deepseek", "high", "DeepSeek V4 Pro, reasoning high (Azure)"),
  hosted("glm53-flash-low", "zai/glm-5.3-flash", "baseten", "zai", "low", "GLM-5.3 Flash, reasoning low (Baseten)"),
  hosted("glm53-flash-high", "zai/glm-5.3-flash", "baseten", "zai", "high", "GLM-5.3 Flash, reasoning high (Baseten)"),
  hosted("glm53-low", "zai/glm-5.3", "baseten", "zai", "low", "GLM-5.3, reasoning low (Baseten)"),
  hosted("kimi-k27-code", "moonshotai/kimi-k2.7-code", "baseten", "moonshot", undefined, "Kimi K2.7 Code (Baseten)"),
  hosted("mistral-large-3", "mistral/mistral-large-3", "mistral", "mistral", undefined, "Mistral Large 3"),
  hosted("qwen3-coder-next", "alibaba/qwen3-coder-next", "bedrock", "alibaba", undefined, "Qwen3 Coder Next (Bedrock)"),
  ovh("ovh-qwen38-27b", "Qwen3.8-27B", undefined, "Qwen3.8 27B (OVHcloud AI Endpoints, EU)"),
  ovh("ovh-qwen38-27b-none", "Qwen3.8-27B", "none", "Qwen3.8 27B, reasoning none (OVHcloud AI Endpoints, EU)"),
  ovh("ovh-qwen38-27b-low", "Qwen3.8-27B", "low", "Qwen3.8 27B, reasoning low (OVHcloud AI Endpoints, EU)"),
  ovh("ovh-qwen35-397b", "Qwen3.5-397B-A17B", undefined, "Qwen3.5 397B-A17B (OVHcloud AI Endpoints, EU)"),
  ovh("ovh-gpt-oss-120b-low", "gpt-oss-120b", "low", "gpt-oss-120b, reasoning low (OVHcloud AI Endpoints, EU)"),
  ovh("ovh-mistral-small-32", "Mistral-Small-3.2-24B-Instruct-2506", undefined, "Mistral Small 3.2 24B (OVHcloud AI Endpoints, EU)"),
  ovh("ovh-qwen3-coder-30b", "Qwen3-Coder-30B-A3B-Instruct", undefined, "Qwen3 Coder 30B-A3B (OVHcloud AI Endpoints, EU)"),
];

export function armById(id: string): BenchmarkArm {
  const arm = BENCHMARK_ARMS.find((candidate) => candidate.id === id);
  if (!arm) throw new Error(`Unknown benchmark arm "${id}".`);
  return arm;
}

export function armModelKey(arm: BenchmarkArm): string {
  if (arm.shipped) return SHIPPED_AGENT_MODEL_KEY;
  return `${BENCHMARK_MODEL_KEY_PREFIX}${arm.id}`;
}

export function defaultBenchmarkArmIds(): string[] {
  const ids = BENCHMARK_ARMS.filter((arm) => arm.shipped).map((arm) => arm.id);
  if (ids.length !== 1) throw new Error(`Expected exactly one shipped benchmark arm, found ${ids.length}.`);
  return ids;
}

export function benchmarkModelEntries(arms: readonly BenchmarkArm[] = BENCHMARK_ARMS): BenchmarkModelEntry[] {
  return arms.filter((arm) => !arm.shipped).map((arm) => ({
    key: `${BENCHMARK_MODEL_KEY_PREFIX}${arm.id}`,
    modelId: arm.modelId,
    servingProvider: arm.servingProvider,
    inferenceRegion: arm.inferenceRegion,
    maxOutputTokens: arm.maxOutputTokens,
    maxContextTokens: arm.maxContextTokens,
    maxToolResultChars: arm.maxToolResultChars,
    ...(arm.reasoningEffort ? { reasoningEffort: arm.reasoningEffort } : {}),
    ...(arm.thinkingLevel ? { thinkingLevel: arm.thinkingLevel } : {}),
  }));
}

export function benchmarkArmsOverlayJson(arms: readonly BenchmarkArm[] = BENCHMARK_ARMS): string {
  return JSON.stringify(benchmarkModelEntries(arms));
}
