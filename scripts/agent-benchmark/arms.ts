import type { AgentReasoningEffort, AgentThinkingLevel, BenchmarkModelEntry } from "@/ee/agent-chat/model-catalog";

import { BENCHMARK_MODEL_KEY_PREFIX } from "@/ee/agent-chat/model-catalog";

export type BenchmarkArm = {
  id: string;
  label: string;
  modelId: string;
  servingProvider: string;
  inferenceRegion: "eu" | "us" | null;
  maxOutputTokens: number;
  reasoningEffort?: AgentReasoningEffort;
  thinkingLevel?: AgentThinkingLevel;
  family: "google" | "openai" | "anthropic" | "deepseek" | "zai" | "moonshot" | "mistral" | "alibaba";
  shipped?: boolean;
};

const ENVELOPE = { maxContextTokens: 66_000, maxToolResultChars: 6000 } as const;

function google(id: string, modelId: string, thinkingLevel: AgentThinkingLevel | undefined, label: string, extra: Partial<BenchmarkArm> = {}): BenchmarkArm {
  return {
    id,
    label,
    modelId,
    servingProvider: "vertex",
    inferenceRegion: "eu",
    maxOutputTokens: thinkingLevel ? 8192 : 2048,
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
    ...(reasoningEffort ? { reasoningEffort } : {}),
    family,
  };
}

export const BENCHMARK_ARMS: readonly BenchmarkArm[] = [
  google("shipped", "google/gemini-3.5-flash-lite", undefined, "Gemini 3.5 Flash-Lite, provider default thinking, 2048 output (shipped)", { shipped: true }),
  google("flash-lite-low", "google/gemini-3.5-flash-lite", "low", "Gemini 3.5 Flash-Lite, thinking low"),
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
  openai("nano-low", "openai/gpt-5-nano", "low", "GPT-5 Nano, reasoning low (the fast catalog key)"),
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
];

export function armById(id: string): BenchmarkArm {
  const arm = BENCHMARK_ARMS.find((candidate) => candidate.id === id);
  if (!arm) throw new Error(`Unknown benchmark arm "${id}".`);
  return arm;
}

export function armModelKey(arm: BenchmarkArm): string {
  return `${BENCHMARK_MODEL_KEY_PREFIX}${arm.id}`;
}

export function benchmarkModelEntries(arms: readonly BenchmarkArm[] = BENCHMARK_ARMS): BenchmarkModelEntry[] {
  return arms.map((arm) => ({
    key: armModelKey(arm),
    modelId: arm.modelId,
    servingProvider: arm.servingProvider,
    inferenceRegion: arm.inferenceRegion,
    maxOutputTokens: arm.maxOutputTokens,
    ...ENVELOPE,
    ...(arm.reasoningEffort ? { reasoningEffort: arm.reasoningEffort } : {}),
    ...(arm.thinkingLevel ? { thinkingLevel: arm.thinkingLevel } : {}),
  }));
}

export function benchmarkArmsOverlayJson(arms: readonly BenchmarkArm[] = BENCHMARK_ARMS): string {
  return JSON.stringify(benchmarkModelEntries(arms));
}
