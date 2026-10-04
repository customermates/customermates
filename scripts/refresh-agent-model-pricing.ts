import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  OVH_AI_ENDPOINTS_ATTESTATION,
  OVH_AI_ENDPOINTS_MODELS_URL,
  OVH_MODEL_ID_PREFIX,
  OVH_SERVING_PROVIDER,
} from "@/ee/agent-chat/ovh-ai-endpoints-catalog";

const GATEWAY_ENDPOINTS_URL = "https://ai-gateway.vercel.sh/v1/models";
const SNAPSHOT_PATH = join(process.cwd(), "ee/agent-chat/model-pricing.snapshot.ts");

const pin = (
  modelId: string,
  provider: string,
  inferenceRegion: "eu" | "us" | null,
  providerNativeModelId = modelId.split("/")[1],
) => ({ modelId, providerNativeModelId, provider, inferenceRegion });

const PINNED = [
  pin("google/gemini-3.5-flash-lite", "vertex", "eu"),
  pin("google/gemini-3.5-flash", "vertex", "eu"),
  pin("google/gemini-3.6-flash", "vertex", "eu"),
  pin("google/gemini-3.8-flash", "vertex", "eu"),
  pin("google/gemini-3.1-flash-lite", "vertex", "eu"),
  pin("openai/gpt-5.6-luna", "azure", null),
  pin("openai/gpt-5.6-terra", "azure", null),
  pin("openai/gpt-5.6-sol", "azure", null),
  pin("openai/gpt-5-nano", "azure", null),
  pin("openai/gpt-5-mini", "azure", null),
  pin("openai/gpt-5.4-mini", "azure", null),
  pin("openai/gpt-5.4-nano", "azure", null),
  pin("anthropic/claude-haiku-4.5", "bedrock", "eu"),
  pin("anthropic/claude-sonnet-5", "bedrock", "eu"),
  pin("anthropic/claude-opus-5", "bedrock", "eu"),
  pin("deepseek/deepseek-v4-flash", "azure", null),
  pin("deepseek/deepseek-v4-pro", "azure", null),
  pin("zai/glm-5.3-flash", "baseten", null),
  pin("zai/glm-5.3", "baseten", null),
  pin("moonshotai/kimi-k2.7-code", "baseten", null),
  pin("mistral/mistral-large-3", "mistral", null),
  pin("alibaba/qwen3-coder-next", "bedrock", null),
  pin("typesafe-ai/jev", "digitalocean", null),
];

// OVHcloud AI Endpoints is served directly, so its prices come from OVH's own
// public catalog rather than the Gateway. Each pin is the native OVH id.
const OVH_PINNED = [
  "Qwen3.8-27B",
  "Qwen3.5-397B-A17B",
  "gpt-oss-120b",
  "Mistral-Small-3.2-24B-Instruct-2506",
  "Qwen3-Coder-30B-A3B-Instruct",
];

type OvhCatalogModel = {
  id: string;
  pricing?: Record<string, unknown>;
  context_length?: unknown;
  max_completion_tokens?: unknown;
};

function ovhRate(pricing: Record<string, unknown>, key: string, nativeModelId: string): string {
  const rate = pricing[key];
  if (typeof rate !== "string" || !/^\d+(\.\d+)?$/.test(rate))
    throw new Error(`OVH model ${nativeModelId} is unpriceable: missing ${key}`);
  return rate;
}

export function ovhPricingEndpoint(nativeModelId: string, catalog: { data?: OvhCatalogModel[] }) {
  const model = catalog.data?.find((candidate) => candidate.id === nativeModelId);
  if (!model) throw new Error(`OVH catalog no longer contains ${nativeModelId}`);
  const pricing = model.pricing ?? {};
  if (pricing.currency_unit !== "USD")
    throw new Error(`OVH model ${nativeModelId} is priced in ${String(pricing.currency_unit)}, not USD`);
  if (typeof model.context_length !== "number" || !Number.isSafeInteger(model.context_length) || model.context_length < 1)
    throw new Error(`OVH model ${nativeModelId} reports no usable context length`);
  const maxCompletionTokens =
    typeof model.max_completion_tokens === "number" &&
    Number.isSafeInteger(model.max_completion_tokens) &&
    model.max_completion_tokens > 0
      ? model.max_completion_tokens
      : null;

  return {
    modelId: `${OVH_MODEL_ID_PREFIX}${nativeModelId}`,
    providerNativeModelId: nativeModelId,
    provider: OVH_SERVING_PROVIDER,
    inferenceRegion: OVH_AI_ENDPOINTS_ATTESTATION.inferenceRegion,
    contextLength: model.context_length,
    maxCompletionTokens,
    requestUsd: ovhRate(pricing, "request", nativeModelId),
    webSearchUsdPerThousandCalls: "0",
    prompt: [{ costUsdPerToken: ovhRate(pricing, "prompt", nativeModelId) }],
    completion: [{ costUsdPerToken: ovhRate(pricing, "completion", nativeModelId) }],
    inputCacheRead: [{ costUsdPerToken: ovhRate(pricing, "input_cache_reads", nativeModelId) }],
    inputCacheWrite: [{ costUsdPerToken: ovhRate(pricing, "input_cache_writes", nativeModelId) }],
  };
}

type CatalogTier = { cost: string; min?: number; max?: number };
type CatalogPricing = Record<string, string | CatalogTier[] | unknown>;
type CatalogModel = {
  id: string;
  regions?: string[] | null;
  pricing: CatalogPricing & { regional?: Record<string, CatalogPricing> };
};

const UNBILLED_WHEN_ABSENT = new Set(["input_cache_write"]);

function tiers(pricing: CatalogPricing, baseKey: string, tierKey: string) {
  const tiered = pricing[tierKey];

  if (Array.isArray(tiered))
    return (tiered as CatalogTier[]).map((tier) => ({
      costUsdPerToken: tier.cost,
      ...(tier.min === undefined ? {} : { minPromptTokens: tier.min }),
      ...(tier.max === undefined ? {} : { maxPromptTokens: tier.max }),
    }));

  const base = pricing[baseKey];
  if (typeof base === "string") return [{ costUsdPerToken: base }];
  if (UNBILLED_WHEN_ABSENT.has(baseKey)) return [{ costUsdPerToken: "0" }];
  if (baseKey === "input_cache_read") return tiers(pricing, "prompt", "prompt_tiers");

  throw new Error(`Model is unpriceable: missing ${baseKey}`);
}

function pricingForRegion(pricing: CatalogModel["pricing"], region: string | null): CatalogPricing {
  if (!region) return pricing;
  const regional = pricing.regional?.[region];
  if (!regional) throw new Error(`Model is unpriceable in region ${region}`);

  const resolved: CatalogPricing = { ...pricing };
  for (const [baseKey, tierKey, endpointBaseKey, endpointTierKey] of [
    ["input", "input_tiers", "prompt", "prompt_tiers"],
    ["output", "output_tiers", "completion", "completion_tiers"],
    ["input_cache_read", "input_cache_read_tiers", "input_cache_read", "input_cache_read_tiers"],
    ["input_cache_write", "input_cache_write_tiers", "input_cache_write", "input_cache_write_tiers"],
  ] as const) {
    delete resolved[endpointBaseKey];
    delete resolved[endpointTierKey];
    if (regional[baseKey] !== undefined) resolved[endpointBaseKey] = regional[baseKey];
    if (regional[tierKey] !== undefined) resolved[endpointTierKey] = regional[tierKey];
  }

  return resolved;
}

async function main() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  const headers: Record<string, string> = apiKey && apiKey !== "XXX" ? { Authorization: `Bearer ${apiKey}` } : {};

  const endpoints = [];
  const catalogResponse = await fetch(GATEWAY_ENDPOINTS_URL, { headers });
  if (!catalogResponse.ok) throw new Error(`Gateway returned ${catalogResponse.status} for the model catalog`);
  const catalogBody = (await catalogResponse.json()) as { data: CatalogModel[] };

  for (const pin of PINNED) {
    const response = await fetch(`${GATEWAY_ENDPOINTS_URL}/${pin.modelId}/endpoints`, { headers });
    if (!response.ok) throw new Error(`Gateway returned ${response.status} for ${pin.modelId}`);

    const body = (await response.json()) as { data: { endpoints: Record<string, unknown>[] } };
    const served = body.data.endpoints.find((endpoint) => endpoint.provider_name === pin.provider);
    if (!served) throw new Error(`Provider ${pin.provider} no longer serves ${pin.modelId}`);
    console.log(`pinning ${pin.modelId} on ${pin.provider}${pin.inferenceRegion ? ` (${pin.inferenceRegion})` : ""}`);
    const catalogModel = catalogBody.data.find((model) => model.id === pin.modelId);
    if (!catalogModel) throw new Error(`Gateway catalog no longer contains ${pin.modelId}`);
    if (pin.inferenceRegion && !catalogModel.regions?.includes(pin.inferenceRegion))
      throw new Error(`Model ${pin.modelId} no longer serves region ${pin.inferenceRegion}`);

    const pricing = pin.inferenceRegion
      ? pricingForRegion(catalogModel.pricing, pin.inferenceRegion)
      : (served.pricing as CatalogPricing);

    endpoints.push({
      modelId: pin.modelId,
      providerNativeModelId: pin.providerNativeModelId,
      provider: pin.provider,
      inferenceRegion: pin.inferenceRegion,
      contextLength: served.context_length as number,
      maxCompletionTokens: (served.max_completion_tokens as number | null) || null,
      requestUsd: (pricing.request as string) ?? "0",
      webSearchUsdPerThousandCalls: (pricing.web_search as string) ?? "0",
      prompt: tiers(pricing, "prompt", "prompt_tiers"),
      completion: tiers(pricing, "completion", "completion_tiers"),
      inputCacheRead: tiers(pricing, "input_cache_read", "input_cache_read_tiers"),
      inputCacheWrite: tiers(pricing, "input_cache_write", "input_cache_write_tiers"),
    });
  }

  const ovhResponse = await fetch(OVH_AI_ENDPOINTS_MODELS_URL);
  if (!ovhResponse.ok) throw new Error(`OVH returned ${ovhResponse.status} for the model catalog`);
  const ovhCatalog = (await ovhResponse.json()) as { data?: OvhCatalogModel[] };
  for (const nativeModelId of OVH_PINNED) {
    console.log(`pinning ${OVH_MODEL_ID_PREFIX}${nativeModelId} on ${OVH_SERVING_PROVIDER} (${OVH_AI_ENDPOINTS_ATTESTATION.inferenceRegion})`);
    endpoints.push(ovhPricingEndpoint(nativeModelId, ovhCatalog));
  }

  const snapshot = {
    source: `${GATEWAY_ENDPOINTS_URL} and ${GATEWAY_ENDPOINTS_URL}/{model}/endpoints; ${OVH_AI_ENDPOINTS_MODELS_URL}`,
    fetchedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    endpoints,
  };

  writeFileSync(SNAPSHOT_PATH, `export const MODEL_PRICING_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)} as const;\n`);
  execFileSync("npx", ["eslint", "--fix", SNAPSHOT_PATH], { stdio: "inherit" });
  console.log(`Refreshed pricing for ${endpoints.length} endpoint(s).`);
}

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) await main();
