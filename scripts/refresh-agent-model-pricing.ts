import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const GATEWAY_ENDPOINTS_URL = "https://ai-gateway.vercel.sh/v1/models";
const SNAPSHOT_PATH = join(process.cwd(), "ee/agent-chat/model-pricing.snapshot.ts");

const PINNED = [
  {
    modelId: "google/gemini-3.5-flash-lite",
    providerNativeModelId: "gemini-3.5-flash-lite",
    provider: "vertex",
    inferenceRegion: "eu",
  },
  {
    modelId: "openai/gpt-5.6-luna",
    providerNativeModelId: "gpt-5.6-luna",
    provider: "azure",
    inferenceRegion: null,
  },
  {
    modelId: "openai/gpt-5-nano",
    providerNativeModelId: "gpt-5-nano",
    provider: "azure",
    inferenceRegion: null,
  },
];

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
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY is required to refresh the pricing snapshot.");

  const endpoints = [];
  const catalogResponse = await fetch(GATEWAY_ENDPOINTS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!catalogResponse.ok) throw new Error(`Gateway returned ${catalogResponse.status} for the model catalog`);
  const catalogBody = (await catalogResponse.json()) as { data: CatalogModel[] };

  for (const pin of PINNED) {
    const response = await fetch(`${GATEWAY_ENDPOINTS_URL}/${pin.modelId}/endpoints`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Gateway returned ${response.status} for ${pin.modelId}`);

    const body = (await response.json()) as { data: { endpoints: Record<string, unknown>[] } };
    const served = body.data.endpoints.find((endpoint) => endpoint.provider_name === pin.provider);
    if (!served) throw new Error(`Provider ${pin.provider} no longer serves ${pin.modelId}`);
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
      maxCompletionTokens: (served.max_completion_tokens as number | null) ?? null,
      requestUsd: (pricing.request as string) ?? "0",
      webSearchUsdPerThousandCalls: (pricing.web_search as string) ?? "0",
      prompt: tiers(pricing, "prompt", "prompt_tiers"),
      completion: tiers(pricing, "completion", "completion_tiers"),
      inputCacheRead: tiers(pricing, "input_cache_read", "input_cache_read_tiers"),
      inputCacheWrite: tiers(pricing, "input_cache_write", "input_cache_write_tiers"),
    });
  }

  const snapshot = {
    source: `${GATEWAY_ENDPOINTS_URL} and ${GATEWAY_ENDPOINTS_URL}/{model}/endpoints`,
    fetchedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    endpoints,
  };

  writeFileSync(SNAPSHOT_PATH, `export const MODEL_PRICING_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)} as const;\n`);
  execFileSync("npx", ["eslint", "--fix", SNAPSHOT_PATH], { stdio: "inherit" });
  console.log(`Refreshed pricing for ${endpoints.length} endpoint(s).`);
}

await main();
