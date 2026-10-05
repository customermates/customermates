import { createOpenAI } from "@ai-sdk/openai";

import { env } from "@/env";

import {
  configuredOvhApiKey,
  isOvhModelId,
  OVH_AI_ENDPOINTS_BASE_URL,
  OVH_SERVING_PROVIDER,
  ovhNativeModelId,
} from "./ovh-ai-endpoints-catalog";

export type AgentDirectLanguageModel = ReturnType<ReturnType<typeof createOpenAI>["chat"]>;

export const AGENT_LANGUAGE_MODEL_RESOLVER = Symbol.for("ai-sdk.workflow.resolveLanguageModel");

type AgentLanguageModelResolver = (modelId: string) => AgentDirectLanguageModel | undefined;

export function createOvhLanguageModel(
  modelId: string,
  options: { apiKey?: string; fetch?: typeof fetch } = {},
): AgentDirectLanguageModel {
  const nativeModelId = ovhNativeModelId(modelId);
  const apiKey = configuredOvhApiKey(options.apiKey ?? env.OVH_AI_ENDPOINTS_API_KEY);
  if (!apiKey) throw new Error("OVH_AI_ENDPOINTS_API_KEY is required to serve an OVHcloud AI Endpoints model.");

  return createOpenAI({
    baseURL: OVH_AI_ENDPOINTS_BASE_URL,
    apiKey,
    name: OVH_SERVING_PROVIDER,
    ...(options.fetch ? { fetch: options.fetch } : {}),
  }).chat(nativeModelId);
}

export function resolveAgentLanguageModel(modelId: string): AgentDirectLanguageModel | undefined {
  return isOvhModelId(modelId) ? createOvhLanguageModel(modelId) : undefined;
}

export function installAgentLanguageModelResolver() {
  const registry = globalThis as unknown as Record<symbol, AgentLanguageModelResolver | undefined>;
  registry[AGENT_LANGUAGE_MODEL_RESOLVER] = resolveAgentLanguageModel;
}
