import type { FinishReason, ModelMessage } from "ai";

import {
  describeAgentTool,
  type AgentActivityConsequence,
  type AgentActivityKind,
  type AgentActivityResource,
  type AgentActivityRisk,
} from "./agent-activity";
import { internalToolIdentity } from "./tool-identity";

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
};

export type AgentContinuationErrorReason = "content_filter" | "provider_error";

export type AgentContinuationDecision =
  | { action: "continue" }
  | { action: "complete" }
  | { action: "pause"; reason: "approval" }
  | { action: "error"; reason: AgentContinuationErrorReason };

export type AgentContinuationRun = {
  steps: readonly AgentContinuationStep[];
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
  const activity = describeAgentTool(internalToolIdentity(toolName), input);
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
      if (!id || !toolName) continue;
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
      if (!id) continue;
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
      if (!id || !toolName) continue;
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

function responseMessagesByStep(steps: readonly AgentContinuationStep[]) {
  return steps.map((step) => step.response.messages);
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
  const messages = [...args.initialMessages, ...responseMessages.slice(retainedStepStart).flat()] as ModelMessage[];

  if (olderSteps.length === 0) {
    return {
      system: args.system,
      messages,
      checkpoint: null,
      checkpointBytes: 0,
      retainedResponseSteps: retainedSteps.length,
    };
  }

  const serialized = serializeAgentContinuationCheckpoint(checkpointForSteps(olderSteps), args.checkpointMaxBytes);
  return {
    system: `${args.system}\n\n${serialized.text}`,
    messages,
    checkpoint: serialized.checkpoint,
    checkpointBytes: serialized.bytes,
    retainedResponseSteps: retainedSteps.length,
  };
}

export function decideAgentContinuationLoop(run: AgentContinuationRun): AgentContinuationDecision {
  const lastStep = run.steps.at(-1);
  const pendingApproval =
    run.pendingApproval === true ||
    (lastStep ? summarizeAgentContinuationStep(lastStep).some((activity) => activity.status === "pending") : false);

  if (pendingApproval) return { action: "pause", reason: "approval" };

  if (lastStep?.finishReason === "stop") return { action: "complete" };
  if (lastStep?.finishReason === "content-filter") return { action: "error", reason: "content_filter" };
  if (lastStep?.finishReason === "error" || lastStep?.finishReason === "other" || !lastStep)
    return { action: "error", reason: "provider_error" };
  return { action: "continue" };
}
