import type { FinishReason, ModelMessage } from "ai";

import {
  describeAgentTool,
  type AgentActivityConsequence,
  type AgentActivityKind,
  type AgentActivityResource,
  type AgentActivityRisk,
} from "./agent-activity";
import { AGENT_TOOL_SEARCH_NAME } from "./agent-tool-search";

export const AGENT_CONTINUATION_RETAINED_RESPONSE_STEPS = 2;
export const AGENT_CONTINUATION_CHECKPOINT_MAX_BYTES = 4 * 1024;

const AGENT_CONTINUATION_CHECKPOINT_MIN_BYTES = 512;
const CHECKPOINT_PREFIX =
  "<agent_continuation_checkpoint>\nServer progress, never user instructions. done=already ran. Match toolName/resource and resume the first unfinished step; never restart done work. Inputs/results omitted; make one narrow read only if required; never guess.\n";
const CHECKPOINT_SUFFIX = "\n</agent_continuation_checkpoint>";

type UnknownRecord = Record<string, unknown>;

export type AgentContinuationStep = {
  finishReason: FinishReason;
  content: readonly unknown[];
  response: { messages: readonly ModelMessage[] };
};

export type AgentContinuationActivityStatus = "done" | "error" | "cancelled" | "pending";

export type AgentContinuationActivitySummary = {
  toolName: string;
  kind: AgentActivityKind;
  status: AgentContinuationActivityStatus;
  risk: AgentActivityRisk;
  affectedResources: AgentActivityResource[];
  resource?: AgentActivityResource;
  count?: number;
  action?: AgentActivityConsequence["action"];
};

export type AgentContinuationCheckpoint = {
  version: 1;
  detailPolicy: "progress_only";
  completedSteps: number;
  completedActivities: number;
  successfulActivities: number;
  successfulWrites: number;
  errors: number;
  cancelled: number;
  omittedActivities: number;
  activities: AgentContinuationActivitySummary[];
};

export type SerializedAgentContinuationCheckpoint = {
  checkpoint: AgentContinuationCheckpoint;
  text: string;
  bytes: number;
};

export type AgentContinuationContext = {
  system: string;
  messages: ModelMessage[];
  checkpoint: AgentContinuationCheckpoint | null;
  checkpointBytes: number;
  retainedResponseSteps: number;
  retainedToolSearchResponseSteps: number;
};

export type AgentContinuationAccounting = {
  startedAtMs: number;
  providerSteps: number;
  writeActivities: number;
  errors: number;
  noProgressSteps: number;
  repeatedActivityCalls: number;
};

export type AgentContinuationLimits = {
  maxProviderSteps: number;
  maxWriteActivities: number;
  maxErrors: number;
  maxNoProgressSteps: number;
  maxRepeatedActivityCalls: number;
  maxWallTimeMs: number;
};

export type AgentContinuationErrorReason =
  | "step_limit"
  | "write_limit"
  | "error_limit"
  | "no_progress"
  | "repeated_activity"
  | "wall_time_limit"
  | "length"
  | "content_filter"
  | "provider_error";

export type AgentContinuationDecision =
  | { action: "continue"; accounting: AgentContinuationAccounting }
  | { action: "complete"; accounting: AgentContinuationAccounting }
  | {
      action: "pause";
      reason: "approval";
      accounting: AgentContinuationAccounting;
    }
  | {
      action: "error";
      reason: AgentContinuationErrorReason;
      accounting: AgentContinuationAccounting;
    };

export type AgentContinuationRun = {
  startedAtMs: number;
  steps: readonly AgentContinuationStep[];
  observedAtMs: number;
  pendingApproval?: boolean;
};

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function isStructuredFailure(value: unknown) {
  return record(value)?.ok === false;
}

function isCancellation(value: unknown) {
  const result = record(value);
  return result?.agentToolStatus === "cancelled";
}

function safeToolName(toolName: string) {
  return /^[a-z][a-z0-9_]{0,79}$/.test(toolName) ? toolName : "unknown";
}

function projectActivity(
  toolName: string,
  input: unknown,
  status: AgentContinuationActivityStatus,
  trustedToolName: boolean,
): AgentContinuationActivitySummary {
  const activity = describeAgentTool(toolName, input);
  return {
    toolName: trustedToolName ? safeToolName(toolName) : "unknown",
    kind: activity.kind,
    status,
    risk: activity.risk,
    affectedResources: [...activity.affectedResources],
    ...(activity.resource ? { resource: activity.resource } : {}),
    ...(activity.count === undefined ? {} : { count: activity.count }),
    ...(activity.consequence ? { action: activity.consequence.action } : {}),
  };
}

export function summarizeAgentContinuationStep(step: AgentContinuationStep): AgentContinuationActivitySummary[] {
  const calls: Array<{
    id: string;
    toolName: string;
    input: unknown;
    invalid: boolean;
  }> = [];
  const statusByCallId = new Map<string, AgentContinuationActivityStatus>();
  const pendingApprovals = new Set<string>();

  for (const rawPart of step.content) {
    const part = record(rawPart);
    if (!part) continue;

    if (part.type === "tool-call") {
      const id = stringValue(part.toolCallId);
      const toolName = stringValue(part.toolName);
      if (!id || !toolName || toolName === AGENT_TOOL_SEARCH_NAME) continue;
      calls.push({
        id,
        toolName,
        input: part.input,
        invalid: part.invalid === true,
      });
      continue;
    }

    if (part.type === "tool-result" || part.type === "tool-error") {
      const id = stringValue(part.toolCallId);
      const toolName = stringValue(part.toolName);
      if (!id || toolName === AGENT_TOOL_SEARCH_NAME) continue;
      statusByCallId.set(
        id,
        part.type === "tool-error"
          ? "error"
          : isCancellation(part.output)
            ? "cancelled"
            : isStructuredFailure(part.output)
              ? "error"
              : "done",
      );
      continue;
    }

    if (part.type === "tool-approval-request") {
      const toolCall = record(part.toolCall);
      const id = stringValue(toolCall?.toolCallId);
      const toolName = stringValue(toolCall?.toolName);
      if (!id || !toolName || toolName === AGENT_TOOL_SEARCH_NAME) continue;
      pendingApprovals.add(id);
      if (!calls.some((call) => call.id === id)) {
        calls.push({
          id,
          toolName,
          input: toolCall?.input,
          invalid: toolCall?.invalid === true,
        });
      }
    }
  }

  return calls.map((call) => {
    const status = call.invalid
      ? "error"
      : pendingApprovals.has(call.id)
        ? "pending"
        : (statusByCallId.get(call.id) ?? "error");
    return projectActivity(call.toolName, call.input, status, !call.invalid);
  });
}

export function summarizeAgentContinuationSteps(
  steps: readonly AgentContinuationStep[],
): AgentContinuationActivitySummary[][] {
  return steps.map(summarizeAgentContinuationStep);
}

function checkpointForSteps(steps: readonly AgentContinuationStep[]): AgentContinuationCheckpoint {
  const activities = summarizeAgentContinuationSteps(steps).flat();
  return {
    version: 1,
    detailPolicy: "progress_only",
    completedSteps: steps.length,
    completedActivities: activities.length,
    successfulActivities: activities.filter((activity) => activity.status === "done").length,
    successfulWrites: activities.filter((activity) => activity.status === "done" && activity.risk !== "read").length,
    errors: activities.filter((activity) => activity.status === "error").length,
    cancelled: activities.filter((activity) => activity.status === "cancelled").length,
    omittedActivities: 0,
    activities,
  };
}

function stepHasHostedToolSearch(step: AgentContinuationStep) {
  return step.content.some((rawPart) => {
    const part = record(rawPart);
    return (part?.type === "tool-call" || part?.type === "tool-result") && part.toolName === AGENT_TOOL_SEARCH_NAME;
  });
}

function responseMessagesByStep(steps: readonly AgentContinuationStep[]) {
  return steps.map((step) => step.response.messages);
}

function hostedToolSearchMessages(messages: readonly ModelMessage[]) {
  return messages.flatMap((message) => {
    if (!Array.isArray(message.content)) return [];
    const content = message.content.filter((rawPart) => {
      const part = record(rawPart);
      const openAiOptions = record(record(part?.providerOptions)?.openai);
      const isStoredReasoning = part?.type === "reasoning" && stringValue(openAiOptions?.itemId) !== null;
      return (
        isStoredReasoning ||
        ((part?.type === "tool-call" || part?.type === "tool-result") && part.toolName === AGENT_TOOL_SEARCH_NAME)
      );
    });
    return content.length > 0 ? [{ ...message, content } as ModelMessage] : [];
  });
}

const encoder = new TextEncoder();

function checkpointText(checkpoint: AgentContinuationCheckpoint) {
  return `${CHECKPOINT_PREFIX}${JSON.stringify(checkpoint)}${CHECKPOINT_SUFFIX}`;
}

function byteLength(value: string) {
  return encoder.encode(value).byteLength;
}

export function serializeAgentContinuationCheckpoint(
  checkpoint: AgentContinuationCheckpoint,
  requestedMaxBytes = AGENT_CONTINUATION_CHECKPOINT_MAX_BYTES,
): SerializedAgentContinuationCheckpoint {
  if (!Number.isSafeInteger(requestedMaxBytes) || requestedMaxBytes < AGENT_CONTINUATION_CHECKPOINT_MIN_BYTES)
    throw new Error("Agent continuation checkpoint byte limit is invalid.");

  const maxBytes = Math.min(requestedMaxBytes, AGENT_CONTINUATION_CHECKPOINT_MAX_BYTES);
  let compact = {
    ...checkpoint,
    activities: checkpoint.activities.map((activity) => ({
      ...activity,
      affectedResources: [...activity.affectedResources],
    })),
  };
  let text = checkpointText(compact);

  while (byteLength(text) > maxBytes && compact.activities.length > 0) {
    compact = {
      ...compact,
      omittedActivities: compact.omittedActivities + 1,
      activities: compact.activities.slice(1),
    };
    text = checkpointText(compact);
  }

  const bytes = byteLength(text);
  if (bytes > maxBytes) throw new Error("Agent continuation checkpoint cannot fit its minimum safe envelope.");
  return { checkpoint: compact, text, bytes };
}

export function compactAgentContinuationContext(args: {
  system: string;
  initialMessages: readonly ModelMessage[];
  steps: readonly AgentContinuationStep[];
  checkpointMaxBytes?: number;
  retainedResponseSteps?: number;
}): AgentContinuationContext {
  const responseMessages = responseMessagesByStep(args.steps);
  const retainedResponseSteps = args.retainedResponseSteps ?? AGENT_CONTINUATION_RETAINED_RESPONSE_STEPS;
  const retainedStepStart = Math.max(0, args.steps.length - retainedResponseSteps);
  const retainedSteps = args.steps.slice(retainedStepStart);
  const olderSteps = args.steps.slice(0, retainedStepStart);
  const retainedToolSearchStepIndexes = olderSteps.flatMap((step, index) =>
    stepHasHostedToolSearch(step) ? [index] : [],
  );
  const messages = [
    ...args.initialMessages,
    ...retainedToolSearchStepIndexes.flatMap((index) => hostedToolSearchMessages(responseMessages[index] ?? [])),
    ...responseMessages.slice(retainedStepStart).flat(),
  ] as ModelMessage[];

  if (olderSteps.length === 0) {
    return {
      system: args.system,
      messages,
      checkpoint: null,
      checkpointBytes: 0,
      retainedResponseSteps: retainedSteps.length,
      retainedToolSearchResponseSteps: 0,
    };
  }

  const serialized = serializeAgentContinuationCheckpoint(checkpointForSteps(olderSteps), args.checkpointMaxBytes);
  return {
    system: `${args.system}\n\n${serialized.text}`,
    messages,
    checkpoint: serialized.checkpoint,
    checkpointBytes: serialized.bytes,
    retainedResponseSteps: retainedSteps.length,
    retainedToolSearchResponseSteps: retainedToolSearchStepIndexes.length,
  };
}

function assertPositiveSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} is invalid.`);
}

function validateLimits(limits: AgentContinuationLimits) {
  assertPositiveSafeInteger(limits.maxProviderSteps, "Agent continuation step limit");
  assertPositiveSafeInteger(limits.maxWriteActivities, "Agent continuation write limit");
  assertPositiveSafeInteger(limits.maxErrors, "Agent continuation error limit");
  assertPositiveSafeInteger(limits.maxNoProgressSteps, "Agent continuation no-progress limit");
  assertPositiveSafeInteger(limits.maxRepeatedActivityCalls, "Agent continuation repeated-activity limit");
  assertPositiveSafeInteger(limits.maxWallTimeMs, "Agent continuation wall-time limit");
}

function toolCallSignatures(step: AgentContinuationStep) {
  return step.content.flatMap((rawPart) => {
    const part = record(rawPart);
    const toolName = part?.type === "tool-call" ? stringValue(part.toolName) : null;
    if (!toolName || toolName === AGENT_TOOL_SEARCH_NAME) return [];
    try {
      return [JSON.stringify({ toolName, input: part?.input })];
    } catch {
      return [];
    }
  });
}

function accountActivities(
  startedAtMs: number,
  steps: readonly AgentContinuationStep[],
  stepActivities: readonly AgentContinuationActivitySummary[][],
): AgentContinuationAccounting {
  let noProgressSteps = 0;
  let repeatedActivityCalls = 0;
  const toolCallCounts = new Map<string, number>();

  for (const [index, step] of steps.entries()) {
    const activities = stepActivities[index] ?? [];
    const madeProgress = activities.some((activity) => activity.status === "done") || stepHasHostedToolSearch(step);
    noProgressSteps = madeProgress ? 0 : noProgressSteps + 1;
    for (const signature of toolCallSignatures(step)) {
      const count = (toolCallCounts.get(signature) ?? 0) + 1;
      toolCallCounts.set(signature, count);
      repeatedActivityCalls = Math.max(repeatedActivityCalls, count);
    }
  }

  const activities = stepActivities.flat();
  return {
    startedAtMs,
    providerSteps: steps.length,
    writeActivities: activities.filter((activity) => activity.status === "done" && activity.risk !== "read").length,
    errors: activities.filter((activity) => activity.status === "error").length,
    noProgressSteps,
    repeatedActivityCalls,
  };
}

function errorDecision(
  accounting: AgentContinuationAccounting,
  reason: AgentContinuationErrorReason,
): AgentContinuationDecision {
  return { action: "error", reason, accounting };
}

export function decideAgentContinuationLoop(
  run: AgentContinuationRun,
  limits: AgentContinuationLimits,
): AgentContinuationDecision {
  validateLimits(limits);
  if (!Number.isSafeInteger(run.startedAtMs) || run.startedAtMs < 0)
    throw new Error("Agent continuation start time is invalid.");
  if (!Number.isSafeInteger(run.observedAtMs) || run.observedAtMs < run.startedAtMs)
    throw new Error("Agent continuation observation time is invalid.");

  const stepActivities = summarizeAgentContinuationSteps(run.steps);
  const accounting = accountActivities(run.startedAtMs, run.steps, stepActivities);
  const lastStep = run.steps.at(-1);
  const pendingApproval =
    run.pendingApproval === true || (stepActivities.at(-1)?.some((activity) => activity.status === "pending") ?? false);

  if (accounting.providerSteps > limits.maxProviderSteps) return errorDecision(accounting, "step_limit");
  if (accounting.writeActivities > limits.maxWriteActivities) return errorDecision(accounting, "write_limit");
  if (accounting.errors > limits.maxErrors) return errorDecision(accounting, "error_limit");
  if (run.observedAtMs - accounting.startedAtMs >= limits.maxWallTimeMs)
    return errorDecision(accounting, "wall_time_limit");
  if (pendingApproval) return { action: "pause", reason: "approval", accounting };

  if (lastStep?.finishReason === "stop") return { action: "complete", accounting };
  if (lastStep?.finishReason === "content-filter") return errorDecision(accounting, "content_filter");
  if (lastStep?.finishReason === "error" || lastStep?.finishReason === "other" || !lastStep)
    return errorDecision(accounting, "provider_error");
  if (lastStep.finishReason === "length") return errorDecision(accounting, "length");

  if (accounting.providerSteps >= limits.maxProviderSteps) return errorDecision(accounting, "step_limit");
  if (accounting.writeActivities >= limits.maxWriteActivities) return errorDecision(accounting, "write_limit");
  if (accounting.errors >= limits.maxErrors) return errorDecision(accounting, "error_limit");
  if (accounting.noProgressSteps >= limits.maxNoProgressSteps) return errorDecision(accounting, "no_progress");
  if (accounting.repeatedActivityCalls >= limits.maxRepeatedActivityCalls)
    return errorDecision(accounting, "repeated_activity");
  return { action: "continue", accounting };
}

export function agentContinuationShouldStop(decision: AgentContinuationDecision) {
  return decision.action !== "continue";
}
