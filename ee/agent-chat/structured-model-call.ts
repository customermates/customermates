import type { AgentModelEntry } from "@/ee/agent-chat/model-catalog";
import type { AgentRetrievalCharge } from "@/ee/agent-chat/agent-usage.service";

import { generateText, NoObjectGeneratedError, Output } from "ai";
import { z } from "zod";

import {
  AGENT_MIN_BYTES_PER_PROVIDER_TOKEN,
  AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS,
} from "@/ee/agent-chat/agent-model";
import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";

const TIMEOUT_MS = 90_000;

function promptTokens(system: string, prompt: string) {
  return (
    Math.ceil(Buffer.byteLength(system + prompt, "utf8") / AGENT_MIN_BYTES_PER_PROVIDER_TOKEN) +
    AGENT_PROVIDER_FRAMING_OVERHEAD_TOKENS
  );
}

function estimatedCharge(model: AgentModelEntry, inputTokens: number, outputTokens: number): AgentRetrievalCharge {
  return {
    model: model.modelId,
    inputTokens,
    costMicrocents: computeCostMicrocents(
      model.modelId,
      { inputTokens, outputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
      model.servingProvider,
      model.inferenceRegion,
    ),
    costSource: "estimated",
  };
}

const GATEWAY_REJECTIONS = new Set([
  "GatewayAuthenticationError",
  "GatewayForbiddenError",
  "GatewayInvalidRequestError",
  "GatewayModelNotFoundError",
  "GatewayNotFoundError",
  "GatewayRateLimitError",
]);

function rejectedBeforeGeneration(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (GATEWAY_REJECTIONS.has(error.name)) return true;
  const status = "statusCode" in error ? error.statusCode : null;
  return typeof status === "number" && status >= 400 && status < 500 && status !== 408;
}

const PROVIDER_WIDE_REJECTIONS = new Set([
  "GatewayAuthenticationError",
  "GatewayForbiddenError",
  "GatewayModelNotFoundError",
  "GatewayNotFoundError",
  "GatewayRateLimitError",
]);
const PROVIDER_WIDE_STATUSES = new Set([401, 403, 404, 429]);

export type WikiSynthesisFailureScope = "request" | "provider";

function failureScope(error: unknown): WikiSynthesisFailureScope {
  if (NoObjectGeneratedError.isInstance(error)) return "request";
  if (!(error instanceof Error)) return "provider";
  if (error.name === "TimeoutError" || error.name === "GatewayInvalidRequestError") return "request";
  if (PROVIDER_WIDE_REJECTIONS.has(error.name)) return "provider";
  const status = "statusCode" in error ? error.statusCode : null;
  return typeof status === "number" && status >= 400 && status < 500 && !PROVIDER_WIDE_STATUSES.has(status)
    ? "request"
    : "provider";
}

function callFailure(label: string, model: string, error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const status =
    typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
      ? ` HTTP ${error.statusCode}`
      : "";
  return `${label} model call to ${model} failed: ${name}${status}.`;
}

export const STRUCTURED_OUTPUT_MAX_UNION_TYPES = 16;
export const STRUCTURED_OUTPUT_REASONING = "none";

export function structuredOutputUnionTypes(schema: z.ZodType): number {
  let unions = 0;
  const pending: unknown[] = [z.toJSONSchema(schema, { io: "input" })];
  while (pending.length) {
    const node = pending.pop();
    if (!node || typeof node !== "object") continue;
    if (!Array.isArray(node) && ("anyOf" in node || "oneOf" in node || ("type" in node && Array.isArray(node.type))))
      unions += 1;
    pending.push(...Object.values(node));
  }
  return unions;
}

const REJECTION_ISSUES = 12;

function issueLines(issues: unknown): string[] {
  if (!Array.isArray(issues)) return [];
  return issues.slice(0, REJECTION_ISSUES).flatMap((issue: unknown) => {
    if (!issue || typeof issue !== "object" || !("message" in issue)) return [];
    const path = "path" in issue && Array.isArray(issue.path) ? issue.path.map(String).join(".") : "";
    return [`${path || "(root)"}: ${String(issue.message)}`];
  });
}

function causeIssues(cause: unknown): string[] {
  const nested = cause instanceof Error && "cause" in cause ? cause.cause : null;
  return issueLines(nested && typeof nested === "object" && "issues" in nested ? nested.issues : null);
}

function decodeEmbeddedJson(value: unknown): unknown {
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^[[{]/u.test(text)) return value;
    try {
      return decodeEmbeddedJson(JSON.parse(text));
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(decodeEmbeddedJson);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, decodeEmbeddedJson(entry)]));
  return value;
}

function parsedText(text: string): unknown {
  try {
    return decodeEmbeddedJson(JSON.parse(text));
  } catch {
    return undefined;
  }
}

export type UnconstrainedOutput<T> = { output: T } | { rejection: string } | null;

export function readUnconstrainedOutput<T>(error: unknown, schema: z.ZodType<T>): UnconstrainedOutput<T> {
  if (!NoObjectGeneratedError.isInstance(error)) return null;
  if (error.finishReason === "length")
    return { rejection: "The answer was cut off at the output limit; keep it shorter." };
  const decoded = error.text ? parsedText(error.text) : undefined;
  if (decoded === undefined) {
    const issues = causeIssues(error.cause);
    return {
      rejection: issues.length
        ? `The answer did not match the required structure: ${issues.join("; ")}.`
        : "The answer was not valid JSON of the required structure.",
    };
  }
  const parsed = schema.safeParse(decoded);
  if (parsed.success) return { output: parsed.data };
  return {
    rejection: `The answer did not match the required structure: ${issueLines(parsed.error.issues).join("; ")}.`,
  };
}

export function structuredCallWorstCaseMicrocents(model: AgentModelEntry, system: string, prompt: string): number {
  return estimatedCharge(model, promptTokens(system, prompt), model.maxOutputTokens).costMicrocents;
}

export async function generateStructuredObject<T>(args: {
  label: string;
  model: AgentModelEntry;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  timeoutMs?: number;
}): Promise<{
  output: T | null;
  charge: AgentRetrievalCharge | null;
  failure?: string;
  failureScope?: WikiSynthesisFailureScope;
  rejection?: string;
}> {
  const inputTokens = promptTokens(args.system, args.prompt);
  try {
    const result = await generateText({
      model: args.model.modelId,
      system: args.system,
      prompt: args.prompt,
      output: Output.object({ schema: args.schema }),
      maxOutputTokens: args.model.maxOutputTokens,
      reasoning: STRUCTURED_OUTPUT_REASONING,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(args.timeoutMs ?? TIMEOUT_MS),
      providerOptions: getAgentProviderOptions(args.model.servingProvider, args.model.inferenceRegion),
    });
    const usage = result.usage;
    const reading = readAgentProviderCharge(result.providerMetadata, args.model.servingProvider);
    const charge: AgentRetrievalCharge =
      reading.outcome === "unreadable"
        ? estimatedCharge(
            args.model,
            usage.inputTokens ?? inputTokens,
            usage.outputTokens ?? args.model.maxOutputTokens,
          )
        : {
            model: args.model.modelId,
            inputTokens: usage.inputTokens ?? inputTokens,
            costMicrocents: reading.outcome === "measured" ? reading.charge.costMicrocents : 0,
            costSource: "measured",
          };
    return { output: result.output, charge };
  } catch (error) {
    const failure = callFailure(args.label, args.model.modelId, error);
    const scope = failureScope(error);
    if (rejectedBeforeGeneration(error)) return { output: null, charge: null, failure, failureScope: scope };
    const usage = NoObjectGeneratedError.isInstance(error) ? error.usage : undefined;
    const unconstrained = readUnconstrainedOutput(error, args.schema);
    if (unconstrained && "output" in unconstrained) {
      return {
        output: unconstrained.output,
        charge: estimatedCharge(
          args.model,
          usage?.inputTokens ?? inputTokens,
          usage?.outputTokens ?? args.model.maxOutputTokens,
        ),
      };
    }
    const rejection = unconstrained?.rejection;
    return {
      output: null,
      failure,
      failureScope: scope,
      ...(rejection ? { rejection } : {}),
      charge: estimatedCharge(
        args.model,
        usage?.inputTokens ?? inputTokens,
        usage?.outputTokens ?? args.model.maxOutputTokens,
      ),
    };
  }
}
