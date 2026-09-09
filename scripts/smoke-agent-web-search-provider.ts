import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createGateway, generateText, isStepCount, type ToolSet } from "ai";

import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import {
  AGENT_WEB_SEARCH_CONTEXT_SIZE,
  AGENT_WEB_SEARCH_MAX_TOOL_CALLS_PER_ROUND,
  AGENT_WEB_SEARCH_MAX_USD_PER_CALL,
  AGENT_WEB_SOURCE_MAX_LENGTH,
  collectAgentWebSources,
  getAgentWebSearchTool,
} from "@/ee/agent-chat/agent-web-search";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import {
  MODEL_CATALOG,
  SHIPPED_AGENT_MODEL_KEY,
} from "@/ee/agent-chat/model-catalog";
import {
  computeCostMicrocents,
  modelPromptTierBoundaries,
  modelProviderContextLength,
  resolveModelPricing,
} from "@/ee/agent-chat/model-pricing";

const SHIPPED_MODEL = MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY];
const MODEL = SHIPPED_MODEL.modelId;
const PROVIDER = SHIPPED_MODEL.servingProvider;
const DOMAIN = "iana.org";
const PROMPT =
  "Use web search to give the title of IANA's example-domain page in at most eight words.";
const GATEWAY_ORIGIN = "https://ai-gateway.vercel.sh";
const MODEL_URL = `${GATEWAY_ORIGIN}/v4/ai/language-model`;
const MAX_OUTPUT_TOKENS = 256;
const MAX_REQUEST_BODY_BYTES = 64_000;
const GENERATION_ID_PATTERN = /^gen_[0-9A-HJKMNP-TV-Z]{26}$/u;

export const AGENT_WEB_SEARCH_SMOKE_MAX_USD = 0.55;

type JsonRecord = Record<string, unknown>;
type Gateway = ReturnType<typeof createGateway>;
type Generation = Awaited<ReturnType<Gateway["getGenerationInfo"]>>;
type PriceBound = { inputPerMTok: number; outputPerMTok: number };
type RequestKind = "model" | "generation";

class SmokeFailure extends Error {
  constructor(
    readonly stage: string,
    message: string,
    readonly evidence?: JsonRecord,
  ) {
    super(message);
  }
}

function fail(stage: string, message: string, evidence?: JsonRecord): never {
  throw new SmokeFailure(stage, message, evidence);
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function pinnedMaximumRates(): PriceBound {
  const promptCeiling = modelProviderContextLength(MODEL, PROVIDER);
  const samples = [
    0,
    ...modelPromptTierBoundaries(MODEL, PROVIDER).filter(
      (edge) => edge <= promptCeiling,
    ),
    promptCeiling,
  ].map((tokens) => resolveModelPricing(MODEL, tokens, PROVIDER));
  return {
    inputPerMTok: Math.max(
      ...samples.flatMap((price) => [
        price.inputPerMTok,
        price.cacheReadPerMTok,
        price.cacheWritePerMTok,
      ]),
    ),
    outputPerMTok: Math.max(...samples.map((price) => price.outputPerMTok)),
  };
}

export function providerSmokeUpperBoundUsd() {
  const rates = pinnedMaximumRates();
  const inputTokens = modelProviderContextLength(MODEL, PROVIDER);
  return (
    AGENT_WEB_SEARCH_MAX_USD_PER_CALL +
    (inputTokens * rates.inputPerMTok +
      MAX_OUTPUT_TOKENS * rates.outputPerMTok) /
      1_000_000
  );
}

export function readProviderSmokeCeiling() {
  if (process.env.RUN_AGENT_WEB_SEARCH_SMOKE !== "true")
    fail(
      "configuration",
      "Set RUN_AGENT_WEB_SEARCH_SMOKE=true to opt into the paid smoke.",
    );
  const raw = process.env.AGENT_WEB_SEARCH_SMOKE_MAX_USD;
  if (!raw || !/^\d+(\.\d+)?$/u.test(raw))
    fail(
      "configuration",
      "Set AGENT_WEB_SEARCH_SMOKE_MAX_USD to the explicitly approved dollar ceiling.",
    );
  const ceiling = Number(raw);
  if (ceiling <= 0 || ceiling > AGENT_WEB_SEARCH_SMOKE_MAX_USD)
    fail(
      "configuration",
      `The provider-smoke ceiling must be at most USD ${AGENT_WEB_SEARCH_SMOKE_MAX_USD}.`,
    );
  if (providerSmokeUpperBoundUsd() > ceiling)
    fail(
      "ceiling",
      "The one-search synthetic worst case exceeds the approved ceiling.",
    );
  if (!process.env.AI_GATEWAY_API_KEY)
    fail("configuration", "AI_GATEWAY_API_KEY is required.");
  return ceiling;
}

function exactKeys(value: JsonRecord | null, keys: readonly string[]) {
  return (
    JSON.stringify(Object.keys(value ?? {}).toSorted()) ===
    JSON.stringify([...keys].toSorted())
  );
}

export async function assertProviderSmokeRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<RequestKind> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.href === MODEL_URL && request.method === "POST") {
    const raw = await request.clone().text();
    const bodyBytes = new TextEncoder().encode(raw).byteLength;
    if (bodyBytes > MAX_REQUEST_BODY_BYTES)
      fail("ceiling", "Serialized model request exceeded the synthetic bound.");
    let body: JsonRecord | null = null;
    try {
      body = record(JSON.parse(raw));
    } catch {
      fail("request", "Serialized model request is not JSON.");
    }
    if (!body)
      fail("request", "Serialized model request is not a JSON object.");
    const options = record(body.providerOptions);
    const gateway = record(options?.gateway);
    const openai = record(options?.openai);
    const choice = record(body.toolChoice);
    const tools = Array.isArray(body.tools) ? body.tools : [];
    const native = record(tools[0]);
    const args = record(native?.args);
    const filters = record(args?.filters);
    const header = (name: string) => request.headers.get(name)?.trim() ?? "";
    const expectedPrompt = [
      { role: "user", content: [{ type: "text", text: PROMPT }] },
    ];
    const valid = [
      header("ai-language-model-id") === MODEL,
      header("ai-language-model-specification-version") === "4",
      header("ai-language-model-streaming") === "false",
      header("ai-gateway-protocol-version") === "0.0.1",
      header("authorization").startsWith("Bearer "),
      body.serviceTier === undefined,
      JSON.stringify(body.prompt) === JSON.stringify(expectedPrompt),
      body.maxOutputTokens === MAX_OUTPUT_TOKENS,
      tools.length === 1,
      exactKeys(native, ["args", "id", "name", "type"]),
      native?.type === "provider" &&
        native.id === "openai.web_search" &&
        native.name === "web_search",
      exactKeys(args, ["externalWebAccess", "filters", "searchContextSize"]),
      args?.externalWebAccess === true &&
        args.searchContextSize === AGENT_WEB_SEARCH_CONTEXT_SIZE,
      exactKeys(filters, ["allowedDomains"]),
      JSON.stringify(filters?.allowedDomains) === JSON.stringify([DOMAIN]),
      exactKeys(gateway, [
        "disallowPromptTraining",
        "only",
        "zeroDataRetention",
      ]),
      JSON.stringify(gateway?.only) === JSON.stringify([PROVIDER]),
      gateway?.zeroDataRetention === true &&
        gateway.disallowPromptTraining === true,
      exactKeys(openai, ["maxToolCalls", "parallelToolCalls", "store"]),
      openai?.store === false && openai.parallelToolCalls === false,
      openai?.maxToolCalls === AGENT_WEB_SEARCH_MAX_TOOL_CALLS_PER_ROUND,
      choice?.type === "tool" && choice.toolName === "web_search",
    ];
    if (!valid.every(Boolean))
      fail(
        "request",
        "Serialized request did not preserve the bounded model, routing, privacy, or native tool.",
      );
    return "model";
  }
  const generationId = url.searchParams.get("id") ?? "";
  if (
    url.origin === GATEWAY_ORIGIN &&
    url.pathname === "/v1/generation" &&
    request.method === "GET" &&
    url.searchParams.size === 1 &&
    GENERATION_ID_PATTERN.test(generationId) &&
    request.headers.get("authorization")?.startsWith("Bearer ")
  )
    return "generation";
  return fail(
    "request",
    "Smoke refused an unexpected authenticated Gateway request.",
  );
}

export function runProviderSmokeModelRequest(gateway: Gateway) {
  return generateText({
    model: gateway(MODEL),
    prompt: PROMPT,
    tools: {
      web_search: getAgentWebSearchTool({ allowedDomains: [DOMAIN] }),
    } as unknown as ToolSet,
    toolChoice: { type: "tool", toolName: "web_search" },
    stopWhen: isStepCount(1),
    maxRetries: 0,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    timeout: { totalMs: 45_000, stepMs: 40_000 },
    providerOptions: getAgentProviderOptions(PROVIDER),
  });
}

export function assertProviderSmokeSources(content: readonly unknown[]) {
  const sources = collectAgentWebSources([{ content }]);
  if (sources.length === 0)
    fail("generation", "Provider emitted no usable HTTPS source.");
  for (const source of sources) {
    if (source.length > AGENT_WEB_SOURCE_MAX_LENGTH)
      fail("generation", "Provider emitted an oversized source.");
    const url = new URL(source);
    if (url.hostname !== DOMAIN && !url.hostname.endsWith(`.${DOMAIN}`))
      fail(
        "generation",
        "Provider emitted a source outside the requested domain.",
      );
  }
  return sources;
}

function generationIdFrom(
  value: unknown,
  seen = new Set<unknown>(),
): string | null {
  if (!value || seen.has(value)) return null;
  seen.add(value);
  const object = record(value);
  if (!object) return null;
  if (
    typeof object.generationId === "string" &&
    GENERATION_ID_PATTERN.test(object.generationId)
  )
    return object.generationId;
  for (const key of ["cause", "data", "responseBody", "value"]) {
    const nested = generationIdFrom(object[key], seen);
    if (nested) return nested;
  }
  return null;
}

async function lookupGeneration(gateway: Gateway, id: string) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await gateway.getGenerationInfo({ id });
    } catch {
      if (attempt === 5)
        fail("settlement", "Gateway generation metadata was unavailable.", {
          costEvidence: { outcome: "unresolved", modelRequestSent: true },
        });
      await new Promise((retry) => setTimeout(retry, 750));
    }
  }
  return fail("settlement", "Gateway generation lookup ended unexpectedly.");
}

export function expectedProviderSmokeCostMicrocents(
  generation: Pick<
    Generation,
    | "promptTokens"
    | "completionTokens"
    | "cachedTokens"
    | "cacheCreationTokens"
    | "billableWebSearchCalls"
  >,
) {
  const uncached =
    generation.promptTokens -
    generation.cachedTokens -
    generation.cacheCreationTokens;
  const counts = [
    uncached,
    generation.cachedTokens,
    generation.cacheCreationTokens,
    generation.completionTokens,
  ];
  if (!counts.every((count) => Number.isSafeInteger(count) && count >= 0))
    fail("settlement", "Gateway returned an invalid usage breakdown.");
  return (
    computeCostMicrocents(
      MODEL,
      {
        inputTokens: uncached,
        outputTokens: generation.completionTokens,
        cacheReadTokens: generation.cachedTokens,
        cacheWriteTokens: generation.cacheCreationTokens,
      },
      PROVIDER,
    ) +
    generation.billableWebSearchCalls *
      Math.round(AGENT_WEB_SEARCH_MAX_USD_PER_CALL * 100_000_000)
  );
}

function generationEvidence(generation: Generation) {
  return {
    costEvidence: {
      outcome: "measured",
      provider: generation.providerName,
      billedSearches: generation.billableWebSearchCalls,
      costUsd: generation.totalCost,
    },
  };
}

function assertGeneration(
  generation: Generation,
  ceiling: number,
  maxSearches: number,
) {
  const valid = [
    generation.model === MODEL,
    generation.providerName === PROVIDER,
    !generation.isByok,
    generation.upstreamInferenceCost === 0,
    Number.isFinite(generation.totalCost) &&
      generation.totalCost >= 0 &&
      generation.totalCost <= ceiling,
    Math.abs(generation.usage - generation.totalCost) <= 0.00000001,
    Number.isSafeInteger(generation.billableWebSearchCalls),
    generation.billableWebSearchCalls >= 0 &&
      generation.billableWebSearchCalls <= maxSearches,
  ];
  if (!valid.every(Boolean))
    fail(
      "settlement",
      "Generation did not preserve the bounded Azure billing policy.",
      generationEvidence(generation),
    );
}

async function runSmoke() {
  const ceiling = readProviderSmokeCeiling();
  let requestCount = 0;
  let requestSent = false;
  let responseGenerationId: string | null = null;
  const upperBound = providerSmokeUpperBoundUsd();
  const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
    fetch: async (input, init) => {
      const inspected = await assertProviderSmokeRequest(input, init);
      if (inspected === "model") {
        requestCount += 1;
        if (requestCount !== 1)
          fail("request", "Smoke attempted a second model request.");
        if (upperBound > ceiling)
          fail(
            "ceiling",
            "The serialized request exceeds the approved ceiling.",
          );
        requestSent = true;
      }
      const response = await fetch(input, { ...init, redirect: "error" });
      if (inspected === "model") {
        responseGenerationId = response.headers.get(
          "x-ai-gateway-generation-id",
        );
      }
      return response;
    },
  });

  let result: Awaited<ReturnType<typeof runProviderSmokeModelRequest>>;
  try {
    result = await runProviderSmokeModelRequest(gateway);
  } catch (error) {
    if (!requestSent)
      return fail("request", "The bounded Gateway request was not sent.");
    const id = generationIdFrom(error) ?? responseGenerationId;
    if (!id)
      return fail(
        "generation",
        "The model request failed without a Gateway generation receipt.",
        {
          costEvidence: { outcome: "unresolved", modelRequestSent: true },
        },
      );
    const generation = await lookupGeneration(gateway, id);
    assertGeneration(
      generation,
      ceiling,
      AGENT_WEB_SEARCH_MAX_TOOL_CALLS_PER_ROUND,
    );
    return fail(
      "generation",
      "The model request failed after Gateway recorded its cost.",
      generationEvidence(generation),
    );
  }
  if (requestCount !== 1)
    fail("request", "Smoke did not make exactly one model request.");
  const charge = readAgentProviderCharge(
    result.finalStep.providerMetadata,
    PROVIDER,
  );
  if (charge.outcome !== "measured" || !charge.charge.generationId)
    fail("settlement", "Gateway omitted the production settlement fields.");
  const generation = await lookupGeneration(
    gateway,
    charge.charge.generationId,
  );
  assertGeneration(
    generation,
    ceiling,
    AGENT_WEB_SEARCH_MAX_TOOL_CALLS_PER_ROUND,
  );
  const expectedCost = expectedProviderSmokeCostMicrocents(generation);
  const actualCost = Math.round(generation.totalCost * 100_000_000);
  const settled = [
    generation.id === charge.charge.generationId,
    generation.promptTokens <= modelProviderContextLength(MODEL, PROVIDER),
    generation.completionTokens <= MAX_OUTPUT_TOKENS,
    generation.billableWebSearchCalls ===
      AGENT_WEB_SEARCH_MAX_TOOL_CALLS_PER_ROUND,
    Math.abs(actualCost - expectedCost) <= 1,
    Math.abs(charge.charge.costMicrocents - expectedCost) <= 1,
  ];
  if (!settled.every(Boolean))
    fail(
      "settlement",
      "Generation failed exact search-cost settlement checks.",
    );
  const calls = result.toolCalls.filter(
    (call) => call.toolName === "web_search" && call.providerExecuted === true,
  );
  const results = result.toolResults.filter(
    (item) => item.toolName === "web_search" && item.providerExecuted === true,
  );
  if (calls.length !== 1 || results.length !== 1)
    fail(
      "generation",
      "Native web search was not provider-executed exactly once.",
    );
  const sources = assertProviderSmokeSources(result.finalStep.content);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      model: MODEL,
      provider: PROVIDER,
      request: { count: requestCount, bounded: true },
      privacy: { gatewayPolicySerialized: true },
      result: {
        providerExecutedSearches: calls.length,
        httpsSources: sources.length,
      },
      cost: {
        billedSearches: generation.billableWebSearchCalls,
        authoritativeMicrocents: actualCost,
        exactMatch: true,
        approvedCeilingUsd: ceiling,
        syntheticUpperBoundUsd: upperBound,
        providerEnforcedCeiling: false,
      },
    })}\n`,
  );
}

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    await runSmoke();
  } catch (error) {
    const failure =
      error instanceof SmokeFailure
        ? error
        : new SmokeFailure("unexpected", "Unexpected smoke failure.");
    process.stderr.write(
      `${JSON.stringify({ ok: false, stage: failure.stage, reason: failure.message, ...failure.evidence })}\n`,
    );
    process.exitCode = 1;
  }
}
