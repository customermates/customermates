import "dotenv/config";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createGateway, generateText, isStepCount } from "ai";

import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import { isSuccessfulAgentWebResult } from "@/ee/agent-chat/agent-web-policy";
import {
  AGENT_WEB_SEARCH_DEFAULT_CONTENT_CHARS,
  AGENT_WEB_SEARCH_DEFAULT_RESULTS,
  AGENT_WEB_SEARCH_TOOL_NAME,
  agentWebSourcesFooter,
  collectAgentWebSources,
  getAgentWebSearchTool,
} from "@/ee/agent-chat/agent-web-search";
import { buildAgentUsageSettlement, usageToTokenCounts } from "@/ee/agent-chat/agent-usage-settlement";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { MODEL_CATALOG, SHIPPED_AGENT_MODEL_KEY } from "@/ee/agent-chat/model-catalog";
import type { TokenCounts } from "@/ee/agent-chat/model-pricing";

const MODEL = MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY];
const MODEL_URL = "https://ai-gateway.vercel.sh/v4/ai/language-model";
const DOMAIN = "customermates.com";
const PROMPT = [
  "Call web_search exactly once with exactly this input:",
  '{"query":"site:customermates.com Customermates homepage title primary heading product","type":"auto","num_results":4,"include_domains":["customermates.com"],"contents":{"text":{"max_characters":1100,"verbosity":"standard"}}}.',
  "Then state the homepage title, primary heading, what the product does, and how AI agents connect to it in at most three sentences, using only the returned evidence.",
].join(" ");
const MAX_OUTPUT_TOKENS = 512;
const MAX_MODEL_REQUESTS = 2;
const MAX_REQUEST_BODY_BYTES = 256_000;
const REQUEST_TIMEOUT_MS = 60_000;
const RECEIPT_ATTEMPTS = 30;
const RECEIPT_RETRY_MS = 1_000;
const CREDIT_OBSERVATION_ATTEMPTS = 30;
const APPLICATION_CREDIT_RESERVATION = 100;
const COST_EPSILON_USD = 0.00000001;

export const AGENT_WEB_SEARCH_SMOKE_MAX_USD = 15;
export const AGENT_WEB_SEARCH_FEASIBILITY_BLOCKERS = [
  "Production remains fail-closed until a human confirms that the Gateway contract and Exa terms cover customer search queries under the required data-processing policy.",
  "Gateway exposes no deterministic per-response invocation cap for native Exa Search, so unattended routine release remains blocked until that cap exists or its maximum cost is reserved.",
  "Gateway has not documented that developer result and text limits suppress every other model-supplied Exa expansion option, so per-call work and cost are not yet proven bounded.",
] as const;

type JsonRecord = Record<string, unknown>;
type Gateway = ReturnType<typeof createGateway>;
type Generation = Awaited<ReturnType<Gateway["getGenerationInfo"]>>;
type SmokeRequestPhase = "search" | "answer";

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

function unwrapJson(value: unknown): JsonRecord | null {
  const raw = record(value);
  return raw?.type === "json" ? record(raw.value) : raw;
}

function asFiniteNumber(value: unknown): number {
  if (typeof value !== "string" && typeof value !== "number") return NaN;
  return Number(value);
}

function addTokens(left: TokenCounts, right: TokenCounts): TokenCounts {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  };
}

function providerOptions() {
  return getAgentProviderOptions(MODEL.servingProvider, MODEL.inferenceRegion);
}

export function assertProviderSmokeFeasible() {
  return {
    maxOuterModelRequests: MAX_MODEL_REQUESTS,
    expectedNativeSearchCalls: 1,
    maxRetries: 0,
    maxOutputTokensPerRequest: MAX_OUTPUT_TOKENS,
    timeoutMs: REQUEST_TIMEOUT_MS,
    publicHomepageOnly: DOMAIN,
  } as const;
}

export function readProviderSmokePostRunThreshold() {
  if (process.env.RUN_AGENT_WEB_SEARCH_SMOKE !== "true")
    fail("configuration", "Set RUN_AGENT_WEB_SEARCH_SMOKE=true to request a paid smoke.");
  const raw = process.env.AGENT_WEB_SEARCH_SMOKE_MAX_USD;
  if (!raw || !/^\d+(\.\d+)?$/.test(raw))
    fail("configuration", "An explicitly approved per-run post-spend USD threshold is required.");
  const threshold = Number(raw);
  if (!Number.isFinite(threshold) || threshold <= 0 || threshold > AGENT_WEB_SEARCH_SMOKE_MAX_USD)
    fail("configuration", "The provider-test post-run threshold must not exceed USD 15.");
  if (!process.env.AI_GATEWAY_API_KEY?.trim())
    fail("configuration", "AI_GATEWAY_API_KEY is required for a paid smoke.");
  assertProviderSmokeFeasible();
  return threshold;
}

function expectedNativeTools() {
  const tool = getAgentWebSearchTool({ allowedDomains: [DOMAIN] });
  return [
    {
      type: "provider",
      name: AGENT_WEB_SEARCH_TOOL_NAME,
      id: "gateway.exa_search",
      args: tool.args,
    },
  ];
}

export async function assertProviderSmokeRequest(
  request: Request,
  { phase = "search" }: { phase?: SmokeRequestPhase } = {},
) {
  const raw = await request.clone().text();
  if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BODY_BYTES)
    fail("serialization", "Smoke request exceeded the serialization bound.");

  let body: JsonRecord | null;
  try {
    body = record(JSON.parse(raw));
  } catch {
    return fail("serialization", "SDK request is not JSON.");
  }
  if (!body) return fail("serialization", "SDK request is not an object.");

  const prompt = Array.isArray(body.prompt) ? body.prompt : [];
  const firstMessage = record(prompt[0]);
  const firstContent = Array.isArray(firstMessage?.content) ? firstMessage.content : [];
  const firstPart = record(firstContent[0]);
  const expectedToolChoice =
    phase === "search" ? { type: "tool", toolName: AGENT_WEB_SEARCH_TOOL_NAME } : { type: "none" };
  const valid = [
    request.url === MODEL_URL && request.method === "POST",
    request.headers.get("ai-language-model-id") === MODEL.modelId,
    request.headers.get("ai-language-model-specification-version") === "4",
    request.headers.get("ai-language-model-streaming") === "false",
    request.headers.get("ai-gateway-protocol-version") === "0.0.1",
    body.maxOutputTokens === MAX_OUTPUT_TOKENS,
    body.serviceTier === undefined,
    firstMessage?.role === "user" && firstPart?.text === PROMPT,
    phase === "search" ? prompt.length === 1 : prompt.length >= 3,
    sameJson(body.toolChoice, expectedToolChoice),
    sameJson(body.tools, expectedNativeTools()),
    sameJson(body.providerOptions, providerOptions()),
  ];
  if (!valid.every(Boolean))
    fail(
      "serialization",
      "SDK request did not preserve the current model, provider, region, ZDR policy, or bounded native Exa tool.",
    );

  return {
    phase,
    model: MODEL.modelId,
    provider: MODEL.servingProvider,
    inferenceRegion: MODEL.inferenceRegion,
    nativeTools: expectedNativeTools(),
    providerOptions: providerOptions(),
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
      tools: {
        [AGENT_WEB_SEARCH_TOOL_NAME]: getAgentWebSearchTool({
          allowedDomains: [DOMAIN],
        }),
      },
      toolChoice: { type: "tool", toolName: AGENT_WEB_SEARCH_TOOL_NAME },
      stopWhen: isStepCount(1),
      maxRetries: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      providerOptions: providerOptions(),
    });
  } catch {
    // The injected fetch deliberately stops before any network request.
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

function regionAndPolicyMatch(metadata: unknown) {
  const gateway = record(record(metadata)?.gateway);
  const routing = record(gateway?.routing);
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

  return gateway?.enabledZeroDataRetention === true && gateway.enabledDisallowPromptTraining === true && regionsMatch;
}

export function inspectProviderSmokeBilling(metadata: unknown, generation: Generation) {
  const charge = readAgentProviderCharge(metadata, MODEL.servingProvider);
  const gateway = record(record(metadata)?.gateway);
  const searchCalls = record(gateway?.gatewayToolCalls)?.exa_search;
  const inferenceCost = asFiniteNumber(gateway?.inferenceCost);
  const marketCost = asFiniteNumber(gateway?.cost);
  const gatewayCost = asFiniteNumber(gateway?.gatewayCost);
  const surchargeCost = asFiniteNumber(gateway?.surchargeCost ?? "0");
  const searchCost = marketCost - inferenceCost;
  const totalMicrocents = Math.round(generation.totalCost * 100_000_000);
  const valid = [
    charge.outcome === "measured" && charge.charge.generationId === generation.id,
    charge.outcome === "measured" && Math.abs(charge.charge.costMicrocents - totalMicrocents) <= 1,
    generation.model === MODEL.modelId,
    generation.providerName === MODEL.servingProvider,
    !generation.isByok && generation.upstreamInferenceCost === 0,
    Number.isFinite(generation.totalCost) && generation.totalCost >= 0 && Number.isSafeInteger(totalMicrocents),
    Math.abs(generation.usage - generation.totalCost) <= COST_EPSILON_USD,
    searchCalls === 1,
    Number.isSafeInteger(generation.billableWebSearchCalls) && generation.billableWebSearchCalls >= 0,
    Number.isFinite(inferenceCost) && inferenceCost >= 0,
    Number.isFinite(searchCost) && searchCost > 0,
    Math.abs(gatewayCost - marketCost - surchargeCost) <= COST_EPSILON_USD,
    Math.abs(generation.totalCost - gatewayCost) <= COST_EPSILON_USD,
    regionAndPolicyMatch(metadata),
  ];
  if (!valid.every(Boolean))
    fail(
      "settlement",
      "Receipt did not reconcile authoritative all-in cost, the Exa charge, and the model's provider, EU inference region, ZDR, and no-training policy.",
    );

  return {
    authoritativeMicrocents: totalMicrocents,
    billedSearches: searchCalls,
    generationBillableWebSearchCalls: generation.billableWebSearchCalls,
    measuredSearchCostUsd: searchCost,
    searchCostInclusionVerified: true,
    modelInferenceZeroDataRetention: true,
    releasePrerequisitesSatisfied: false,
  };
}

function decimalUsdUnits(value: string): bigint {
  if (!/^\d+(\.\d+)?$/.test(value)) fail("settlement", "Gateway credit usage was not a decimal USD value.");
  const [whole, fraction = ""] = value.split(".");
  const units = `${whole}${fraction.slice(0, 8).padEnd(8, "0")}`;
  return BigInt(units);
}

function delay(ms: number) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function readGenerationReceipt(gateway: Gateway, generationId: string): Promise<Generation> {
  for (let attempt = 0; attempt < RECEIPT_ATTEMPTS; attempt += 1) {
    try {
      return await gateway.getGenerationInfo({ id: generationId });
    } catch {
      if (attempt + 1 < RECEIPT_ATTEMPTS) await delay(RECEIPT_RETRY_MS);
    }
  }
  fail("settlement", "Gateway generation receipt did not become available within the bounded observation window.");
}

async function observeGatewayCreditDebit(gateway: Gateway, beforeTotalUsed: string, expectedUnits: bigint) {
  const before = decimalUsdUnits(beforeTotalUsed);
  let observed = 0n;
  for (let attempt = 0; attempt < CREDIT_OBSERVATION_ATTEMPTS; attempt += 1) {
    const after = await gateway.getCredits();
    observed = decimalUsdUnits(after.totalUsed) - before;
    if (observed >= expectedUnits) return observed;
    if (attempt + 1 < CREDIT_OBSERVATION_ATTEMPTS) await delay(RECEIPT_RETRY_MS);
  }
  fail("settlement", "Gateway credit usage did not reflect the authoritative generation debit.");
}

export function requestedAdversarialOverrides(value: unknown) {
  const call = record(value);
  if (!call) return false;
  const input = record(call.input) ?? record(call.args);
  const contents = record(input?.contents);
  const text = record(contents?.text);
  return (
    input?.type === "auto" &&
    input.num_results === 4 &&
    Array.isArray(input.include_domains) &&
    input.include_domains.length === 1 &&
    input.include_domains[0] === DOMAIN &&
    text?.max_characters === 1_100 &&
    text.verbosity === "standard"
  );
}

function domainMatches(value: string) {
  const hostname = new URL(value).hostname.toLowerCase();
  return hostname === DOMAIN || hostname.endsWith(`.${DOMAIN}`);
}

function providerToolEvidence(result: {
  text: string;
  steps: readonly {
    toolCalls: readonly unknown[];
    toolResults: readonly unknown[];
  }[];
  response: { messages: readonly unknown[] };
  sources: readonly unknown[];
}) {
  const calls = result.steps
    .flatMap((step) => step.toolCalls)
    .map(record)
    .filter((call): call is JsonRecord => Boolean(call?.toolName === AGENT_WEB_SEARCH_TOOL_NAME));
  const results = result.steps
    .flatMap((step) => step.toolResults)
    .map(record)
    .filter((toolResult): toolResult is JsonRecord => toolResult?.toolName === AGENT_WEB_SEARCH_TOOL_NAME);
  if (calls.length !== 1 || results.length !== 1)
    fail("provider-result", "The provider did not return exactly one Exa Search call and result.");
  if (calls[0].providerExecuted !== true || results[0].providerExecuted !== true)
    fail("provider-result", "Exa Search was not marked as provider-executed.");
  if (!requestedAdversarialOverrides(calls[0]))
    fail("provider-result", "The model did not attempt the requested adversarial search overrides.");
  if (!isSuccessfulAgentWebResult(results[0].output)) fail("provider-result", "Exa Search did not succeed.");

  const output = unwrapJson(results[0].output);
  const items = Array.isArray(output?.results)
    ? output.results.map(record).filter((item): item is JsonRecord => Boolean(item))
    : [];
  if (items.length === 0 || items.length > AGENT_WEB_SEARCH_DEFAULT_RESULTS)
    fail("provider-result", "Exa Search did not honor the result bound.");
  if (
    items.some((item) => typeof item.url !== "string" || !item.url.startsWith("https://") || !domainMatches(item.url))
  )
    fail("provider-result", "Exa Search did not honor the configured domain boundary.");

  const texts = items.map((item) => (typeof item.text === "string" ? item.text : ""));
  if (
    texts.every((text) => text.length === 0) ||
    texts.some((text) => text.length > AGENT_WEB_SEARCH_DEFAULT_CONTENT_CHARS)
  )
    fail("provider-result", "Exa Search did not honor the text bound.");
  const evidenceText = items
    .flatMap((item) => [item.title, item.text])
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const expectedHomepageClaim = /open.source CRM built for AI agents/i;
  if (!/Customermates/i.test(evidenceText) || !expectedHomepageClaim.test(evidenceText) || !/MCP/i.test(evidenceText))
    fail(
      "provider-result",
      "The bounded search results did not recover the known Customermates homepage identity, primary claim, and MCP capability.",
    );
  if (!/Customermates/i.test(result.text) || !expectedHomepageClaim.test(result.text) || !/MCP/i.test(result.text))
    fail(
      "provider-result",
      "The final model answer did not accurately ground the known homepage identity, primary claim, and MCP capability.",
    );

  const sources = collectAgentWebSources([...result.response.messages, { content: result.sources }]).filter(
    domainMatches,
  );
  if (sources.length === 0) fail("provider-result", "Exa Search emitted no verified HTTPS source.");
  if (
    !sources.some((source) => {
      const path = new URL(source).pathname;
      return path === "/" || /^\/[a-z]{2}\/?$/u.test(path);
    })
  )
    fail("provider-result", "Exa Search did not emit the localized or root Customermates homepage source.");
  const answerWithSources = `${result.text}${agentWebSourcesFooter(sources)}`;
  if (!answerWithSources.includes("### Sources"))
    fail("provider-result", "The final answer did not receive a Sources footer.");

  return {
    calls: calls.length,
    results: results.length,
    resultCount: items.length,
    resolvedSearchType: output?.resolvedSearchType,
    maxResultTextCharacters: Math.max(...texts.map((text) => text.length)),
    attemptedOverrides: true,
    configuredResultAndTextBoundsWon: true,
    knownHomepageFactsVerified: true,
    sources,
    answer: result.text,
    answerWithSources,
  };
}

function generationIdFromMetadata(metadata: unknown) {
  const value = record(record(metadata)?.gateway)?.generationId;
  return typeof value === "string" ? value : null;
}

export async function runLiveProviderSmoke(postRunThresholdUsd = readProviderSmokePostRunThreshold()) {
  const nativeFetch = globalThis.fetch.bind(globalThis);
  const serializations: Awaited<ReturnType<typeof assertProviderSmokeRequest>>[] = [];
  const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      const isModelRequest = request.method === "POST" && request.url === MODEL_URL;
      if (isModelRequest) {
        const phase: SmokeRequestPhase = serializations.length === 0 ? "search" : "answer";
        if (serializations.length >= MAX_MODEL_REQUESTS)
          fail("network", "Paid smoke attempted more than two model requests.");
        serializations.push(await assertProviderSmokeRequest(request, { phase }));
      }
      const response = await nativeFetch(input, init);
      if (isModelRequest && !response.ok) {
        const payload = record(
          await response
            .clone()
            .json()
            .catch(() => null),
        );
        const error = record(payload?.error);
        const code = typeof error?.code === "string" ? ` (${error.code})` : "";
        const message = typeof error?.message === "string" ? `: ${error.message}` : "";
        fail("network", `Gateway returned HTTP ${response.status}${code}${message}`);
      }
      return response;
    },
  });
  const creditsBefore = await gateway.getCredits();
  const result = await generateText({
    model: gateway(MODEL.modelId),
    prompt: PROMPT,
    tools: {
      [AGENT_WEB_SEARCH_TOOL_NAME]: getAgentWebSearchTool({
        allowedDomains: [DOMAIN],
      }),
    },
    prepareStep: ({ stepNumber }) => ({
      toolChoice: stepNumber === 0 ? { type: "tool", toolName: AGENT_WEB_SEARCH_TOOL_NAME } : "none",
    }),
    stopWhen: isStepCount(MAX_MODEL_REQUESTS),
    maxRetries: 0,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    timeout: { totalMs: REQUEST_TIMEOUT_MS, stepMs: REQUEST_TIMEOUT_MS },
    providerOptions: providerOptions(),
  });
  if (serializations.length < 1 || serializations.length > MAX_MODEL_REQUESTS)
    fail("network", "Paid smoke did not execute a bounded model request.");

  const evidence = providerToolEvidence(result);
  const receipts = await Promise.all(
    result.steps.map(async (step) => {
      const generationId = generationIdFromMetadata(step.providerMetadata);
      if (!generationId) fail("settlement", "Gateway response did not include a generation id.");
      return readGenerationReceipt(gateway, generationId);
    }),
  );
  const authoritativeMicrocents = result.steps.reduce((total, step, index) => {
    const reading = readAgentProviderCharge(step.providerMetadata, MODEL.servingProvider);
    const receipt = receipts[index];
    if (
      reading.outcome !== "measured" ||
      reading.charge.generationId !== receipt.id ||
      Math.abs(reading.charge.costMicrocents - Math.round(receipt.totalCost * 100_000_000)) > 1 ||
      !regionAndPolicyMatch(step.providerMetadata)
    )
      fail(
        "settlement",
        "A provider round did not preserve authoritative cost, provider, EU region, ZDR, and no-training evidence.",
      );
    return total + reading.charge.costMicrocents;
  }, 0);
  const spentUsd = receipts.reduce((total, receipt) => total + receipt.totalCost, 0);
  if (spentUsd > postRunThresholdUsd)
    fail("settlement", "Observed provider debit exceeded the approved post-run threshold after billing.");

  const searchStepIndex = result.steps.findIndex((step) =>
    step.toolCalls.some((call) => record(call)?.toolName === AGENT_WEB_SEARCH_TOOL_NAME),
  );
  if (searchStepIndex < 0) fail("settlement", "The search-bearing provider round was not found.");
  const billing = inspectProviderSmokeBilling(
    result.steps[searchStepIndex].providerMetadata,
    receipts[searchStepIndex],
  );

  const expectedUnits = BigInt(authoritativeMicrocents);
  const observedDebitUnits = await observeGatewayCreditDebit(gateway, creditsBefore.totalUsed, expectedUnits);
  const stepTokens = result.steps.map((step) => usageToTokenCounts(step.usage));
  const tokens = stepTokens.reduce(addTokens, {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
  const settlement = buildAgentUsageSettlement({
    model: MODEL.modelId,
    provider: MODEL.servingProvider,
    inferenceRegion: MODEL.inferenceRegion,
    tokens,
    reservedCredits: APPLICATION_CREDIT_RESERVATION,
    providerCharge: {
      billed: true,
      measuredCostMicrocents: authoritativeMicrocents,
      stepTokens,
      unreadableReason: null,
    },
  });
  if (
    settlement.costSource !== "measured" ||
    settlement.costMicrocents !== authoritativeMicrocents ||
    settlement.chargedCredits < 1 ||
    settlement.policyBreach
  )
    fail("settlement", "Application credit conversion did not preserve the all-in Gateway debit.");

  return {
    mode: "live" as const,
    networkRequests: serializations.length,
    spentUsd,
    paidExecutionAvailable: true,
    publicHomepageOnly: DOMAIN,
    productionConfigurationUnchanged: true,
    blockers: AGENT_WEB_SEARCH_FEASIBILITY_BLOCKERS,
    serializations,
    providerResult: evidence,
    billing,
    gatewayCreditDebitAtLeastAuthoritative: observedDebitUnits >= expectedUnits,
    applicationCredits: {
      costSource: settlement.costSource,
      costMicrocents: settlement.costMicrocents,
      chargedCredits: settlement.chargedCredits,
      policyBreach: settlement.policyBreach,
    },
    generations: receipts.map((receipt) => ({
      id: receipt.id,
      provider: receipt.providerName,
      model: receipt.model,
      billableWebSearchCalls: receipt.billableWebSearchCalls,
    })),
  };
}

export async function runProviderSmoke() {
  if (process.env.RUN_AGENT_WEB_SEARCH_SMOKE === "true") return runLiveProviderSmoke();
  return inspectProviderSmokeSerialization();
}

const invokedPath = process.argv[1];
if (invokedPath && resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(JSON.stringify({ ok: true, ...(await runProviderSmoke()) }) + "\n");
  } catch (error) {
    const failure =
      error instanceof SmokeFailure
        ? error
        : new SmokeFailure("unexpected", error instanceof Error ? error.message : "Provider smoke failed.");
    process.stderr.write(
      JSON.stringify({
        ok: false,
        stage: failure.stage,
        reason: failure.message,
        mode: process.env.RUN_AGENT_WEB_SEARCH_SMOKE === "true" ? "live" : "offline",
        blockers: AGENT_WEB_SEARCH_FEASIBILITY_BLOCKERS,
      }) + "\n",
    );
    process.exitCode = 1;
  }
}
