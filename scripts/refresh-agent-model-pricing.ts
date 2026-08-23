import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

const GATEWAY_ENDPOINTS_URL = "https://ai-gateway.vercel.sh/v1/models";
const SNAPSHOT_PATH = join(process.cwd(), "ee/agent-chat/model-pricing.snapshot.ts");

const PINNED = [
  { modelId: "openai/gpt-5.6-luna", providerNativeModelId: "gpt-5.6-luna", provider: "openai" },
  { modelId: "openai/gpt-5-nano", providerNativeModelId: "gpt-5-nano", provider: "openai" },
];

type CatalogTier = { cost: string; min?: number; max?: number };
type CatalogPricing = Record<string, string | CatalogTier[] | unknown>;

function tiers(pricing: CatalogPricing, baseKey: string, tierKey: string) {
  const tiered = pricing[tierKey];

  if (Array.isArray(tiered))
    return (tiered as CatalogTier[]).map((tier) => ({
      costUsdPerToken: tier.cost,
      ...(tier.min === undefined ? {} : { minPromptTokens: tier.min }),
      ...(tier.max === undefined ? {} : { maxPromptTokens: tier.max }),
    }));

  const base = pricing[baseKey];
  if (typeof base !== "string") throw new Error(`Model is unpriceable: missing ${baseKey}`);

  return [{ costUsdPerToken: base }];
}

async function main() {
  const apiKey = process.env.AI_GATEWAY_API_KEY;
  if (!apiKey) throw new Error("AI_GATEWAY_API_KEY is required to refresh the pricing snapshot.");

  const endpoints = [];

  for (const pin of PINNED) {
    const response = await fetch(`${GATEWAY_ENDPOINTS_URL}/${pin.modelId}/endpoints`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) throw new Error(`Gateway returned ${response.status} for ${pin.modelId}`);

    const body = (await response.json()) as { data: { endpoints: Record<string, unknown>[] } };
    const served = body.data.endpoints.find((endpoint) => endpoint.provider_name === pin.provider);
    if (!served) throw new Error(`Provider ${pin.provider} no longer serves ${pin.modelId}`);

    const pricing = served.pricing as CatalogPricing;

    endpoints.push({
      modelId: pin.modelId,
      providerNativeModelId: pin.providerNativeModelId,
      provider: pin.provider,
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
    source: `${GATEWAY_ENDPOINTS_URL}/{model}/endpoints`,
    fetchedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    endpoints,
  };

  writeFileSync(SNAPSHOT_PATH, `export const MODEL_PRICING_SNAPSHOT = ${JSON.stringify(snapshot, null, 2)} as const;\n`);
  execFileSync("npx", ["eslint", "--fix", SNAPSHOT_PATH], { stdio: "inherit" });
  console.log(`Refreshed pricing for ${endpoints.length} endpoint(s).`);
}

await main();
