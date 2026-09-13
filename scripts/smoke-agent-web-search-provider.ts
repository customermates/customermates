import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createGateway, generateText, isStepCount } from "ai";

import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import { AGENT_WEB_SEARCH_TOOL_NAME, getAgentWebSearchTool } from "@/ee/agent-chat/agent-web-search";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { MODEL_CATALOG, SHIPPED_AGENT_MODEL_KEY } from "@/ee/agent-chat/model-catalog";

const MODEL = MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY];
const MODEL_URL = "https://ai-gateway.vercel.sh/v4/ai/language-model";
const PROMPT = "Find IANA's example-domain documentation. Return only its title.";
const DOMAIN = "iana.org";
const MAX_OUTPUT_TOKENS = 256;
const MAX_REQUEST_BODY_BYTES = 64_000;

export const AGENT_WEB_SEARCH_SMOKE_MAX_USD = 15;
export const AGENT_WEB_SEARCH_FEASIBILITY_BLOCKERS = [
  "Gateway Perplexity configuration is not a verified immutable runtime query/result limit.",
  "No verified provider-enforced native search-call cap covers parallel calls inside one model request.",
  "Gateway-specific Search data-processing, confidentiality, personal-data permission, and regional terms remain unverified.",
  "Authoritative all-in Gateway cost including every search has not been verified against a live generation receipt.",
] as const;

type JsonRecord = Record<string, unknown>;
type Gateway = ReturnType<typeof createGateway>;
type Generation = Awaited<ReturnType<Gateway["getGenerationInfo"]>>;

class SmokeFailure extends Error {
  constructor(
    readonly stage: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(stage: string, message: string): never {
  throw new SmokeFailure(stage, message);
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function sameJson(actual: unknown, expected: unknown): boolean {
  return JSON.stringify(actual) === JSON.stringify(expected);
}

export function assertProviderSmokeFeasible(): never {
  return fail(
    "feasibility",
    "Paid web-search smoke is disabled before network access: provider-native bounds and Search-specific processing terms are unverified. One HTTP request is not a search-count or spend ceiling.",
  );
}

export function readProviderSmokeCeiling(): never {
  if (process.env.RUN_AGENT_WEB_SEARCH_SMOKE !== "true")
    fail("configuration", "Set RUN_AGENT_WEB_SEARCH_SMOKE=true to request a paid smoke.");
  const raw = process.env.AGENT_WEB_SEARCH_SMOKE_MAX_USD;
  if (!raw || !/^\d+(\.\d+)?$/.test(raw))
    fail("configuration", "An explicitly approved aggregate USD ceiling is required.");
  const ceiling = Number(raw);
  if (!Number.isFinite(ceiling) || ceiling <= 0 || ceiling > AGENT_WEB_SEARCH_SMOKE_MAX_USD)
    fail("configuration", "The aggregate provider-test ceiling must not exceed USD 15.");
  return assertProviderSmokeFeasible();
}

export async function assertProviderSmokeRequest(request: Request) {
  const raw = await request.clone().text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BODY_BYTES)
    fail("serialization", "Synthetic request exceeded the offline serialization bound.");

  let body: JsonRecord | null;
  try {
    body = record(JSON.parse(raw));
  } catch {
    return fail("serialization", "SDK request is not JSON.");
  }
  if (!body) return fail("serialization", "SDK request is not an object.");

  const tool = getAgentWebSearchTool({ allowedDomains: [DOMAIN] });
  const nativeTools = [
    {
      type: "provider",
      name: AGENT_WEB_SEARCH_TOOL_NAME,
      id: "gateway.perplexity_search",
      args: tool.args,
    },
  ];
  const providerOptions = getAgentProviderOptions(MODEL.servingProvider, MODEL.inferenceRegion);
  const valid = [
    request.url === MODEL_URL && request.method === "POST",
    request.headers.get("ai-language-model-id") === MODEL.modelId,
    request.headers.get("ai-language-model-specification-version") === "4",
    request.headers.get("ai-language-model-streaming") === "false",
    request.headers.get("ai-gateway-protocol-version") === "0.0.1",
    body.maxOutputTokens === MAX_OUTPUT_TOKENS,
    body.serviceTier === undefined,
    sameJson(body.prompt, [{ role: "user", content: [{ type: "text", text: PROMPT }] }]),
    sameJson(body.toolChoice, { type: "tool", toolName: AGENT_WEB_SEARCH_TOOL_NAME }),
    sameJson(body.tools, nativeTools),
    sameJson(body.providerOptions, providerOptions),
  ];
  if (!valid.every(Boolean)) {
    fail(
      "serialization",
      "SDK request did not preserve the current model, provider, region, or native Perplexity tool.",
    );
  }
  return {
    model: MODEL.modelId,
    provider: MODEL.servingProvider,
    inferenceRegion: MODEL.inferenceRegion,
    nativeTools,
    providerOptions,
    inputSchemaSent: false,
    requestBodyBytes: new TextEncoder().encode(raw).byteLength,
  };
}

export async function inspectProviderSmokeSerialization() {
  const captured: Request[] = [];
  const gateway = createGateway({
    apiKey: "offline-synthetic-key",
    fetch: (input, init) => {
      captured.push(new Request(input, init));
      return Promise.resolve(
        new Response(JSON.stringify({ error: { message: "Offline serialization stop." } }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      );
    },
  });

  try {
    await generateText({
      model: gateway(MODEL.modelId),
      prompt: PROMPT,
      tools: { [AGENT_WEB_SEARCH_TOOL_NAME]: getAgentWebSearchTool({ allowedDomains: [DOMAIN] }) },
      toolChoice: { type: "tool", toolName: AGENT_WEB_SEARCH_TOOL_NAME },
      stopWhen: isStepCount(1),
      maxRetries: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      providerOptions: getAgentProviderOptions(MODEL.servingProvider, MODEL.inferenceRegion),
    });
  } catch {
    if (captured.length !== 1)
      fail("serialization", "Offline probe did not intercept exactly one synthetic SDK request.");
  }
  if (captured.length !== 1)
    fail("serialization", "Offline probe did not intercept exactly one synthetic SDK request.");

  return {
    mode: "offline" as const,
    networkRequests: 0,
    spentUsd: 0,
    paidExecutionAvailable: false,
    blockers: AGENT_WEB_SEARCH_FEASIBILITY_BLOCKERS,
    serialization: await assertProviderSmokeRequest(captured[0]),
  };
}

export function inspectProviderSmokeBilling(metadata: unknown, generation: Generation) {
  const charge = readAgentProviderCharge(metadata, MODEL.servingProvider);
  const routing = record(record(record(metadata)?.gateway)?.routing);
  const attempts = Array.isArray(routing?.modelAttempts) ? routing.modelAttempts : [];
  const successful = attempts.flatMap((attempt) => {
    const providers = record(attempt)?.providerAttempts;
    return Array.isArray(providers) ? providers.filter((provider) => record(provider)?.success === true) : [];
  });
  const regionsMatch =
    successful.length > 0 &&
    successful.every((attempt) => {
      const endpoint = record(record(attempt)?.inferenceEndpoint);
      return MODEL.inferenceRegion === null
        ? endpoint === null
        : endpoint?.scope === "zone" && endpoint.geoRegion === MODEL.inferenceRegion;
    });
  const totalMicrocents = Math.round(generation.totalCost * 100_000_000);
  const valid = [
    charge.outcome === "measured" && charge.charge.generationId === generation.id,
    charge.outcome === "measured" && Math.abs(charge.charge.costMicrocents - totalMicrocents) <= 1,
    generation.model === MODEL.modelId,
    generation.providerName === MODEL.servingProvider,
    !generation.isByok && generation.upstreamInferenceCost === 0,
    Number.isFinite(generation.totalCost) && generation.totalCost >= 0 && Number.isSafeInteger(totalMicrocents),
    Math.abs(generation.usage - generation.totalCost) <= 0.00000001,
    Number.isSafeInteger(generation.billableWebSearchCalls) && generation.billableWebSearchCalls > 0,
    regionsMatch,
  ];
  if (!valid.every(Boolean))
    fail("settlement", "Receipt did not reconcile authoritative all-in cost, billed searches, provider, and region.");
  return {
    authoritativeMicrocents: totalMicrocents,
    billedSearches: generation.billableWebSearchCalls,
    searchCostInclusionVerified: false,
    releasePrerequisitesSatisfied: false,
  };
}

export async function runProviderSmoke() {
  if (process.env.RUN_AGENT_WEB_SEARCH_SMOKE === "true") readProviderSmokeCeiling();
  return inspectProviderSmokeSerialization();
}

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(JSON.stringify({ ok: true, ...(await runProviderSmoke()) }) + "\n");
  } catch (error) {
    const failure = error instanceof SmokeFailure ? error : new SmokeFailure("unexpected", "Offline smoke failed.");
    process.stderr.write(
      JSON.stringify({
        ok: false,
        stage: failure.stage,
        reason: failure.message,
        networkRequests: 0,
        spentUsd: 0,
        paidExecutionAvailable: false,
        blockers: AGENT_WEB_SEARCH_FEASIBILITY_BLOCKERS,
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
