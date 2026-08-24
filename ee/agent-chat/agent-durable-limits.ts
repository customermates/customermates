import type { AgentContinuationLimits, AgentContinuationStep } from "./agent-continuation";

export const AGENT_DURABLE_MAX_WRITE_ACTIVITIES = 16;
export const AGENT_DURABLE_MAX_ERRORS = 3;
export const AGENT_DURABLE_MAX_NO_PROGRESS_STEPS = 2;
export const AGENT_DURABLE_MAX_REPEATED_ACTIVITY_CALLS = 3;

export const AGENT_DURABLE_UNBOUNDED_WALL_TIME_MS = Number.MAX_SAFE_INTEGER;

export type AgentDurableToolOutcome =
  | { toolCallId: string; toolName: string; output: unknown }
  | { toolCallId: string; toolName: string; threw: true };

export function agentDurableContinuationLimits(maxProviderSteps: number): AgentContinuationLimits {
  return {
    maxProviderSteps,
    maxWriteActivities: AGENT_DURABLE_MAX_WRITE_ACTIVITIES,
    maxErrors: AGENT_DURABLE_MAX_ERRORS,
    maxNoProgressSteps: AGENT_DURABLE_MAX_NO_PROGRESS_STEPS,
    maxRepeatedActivityCalls: AGENT_DURABLE_MAX_REPEATED_ACTIVITY_CALLS,
    maxWallTimeMs: AGENT_DURABLE_UNBOUNDED_WALL_TIME_MS,
  };
}

export function toAgentContinuationStep(
  step: { finishReason: string; content: readonly unknown[] },
  outcomes: readonly AgentDurableToolOutcome[],
): AgentContinuationStep {
  const results = outcomes.map((outcome) =>
    "threw" in outcome
      ? { type: "tool-error", toolCallId: outcome.toolCallId, toolName: outcome.toolName }
      : { type: "tool-result", toolCallId: outcome.toolCallId, toolName: outcome.toolName, output: outcome.output },
  );

  return {
    finishReason: step.finishReason as AgentContinuationStep["finishReason"],
    content: [...step.content, ...results],
    response: { messages: [] },
  };
}
