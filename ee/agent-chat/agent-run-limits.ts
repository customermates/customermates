import type { ModelMessage } from "ai";

import type { AgentContinuationStep } from "./agent-continuation";

export const AGENT_MAX_CONCURRENT_RUNS_PER_USER = 3;

const ASSISTANT_CONTENT_TYPES = new Set(["text", "reasoning", "tool-call", "file"]);

export type AgentToolOutcome =
  | { toolCallId: string; toolName: string; output: unknown }
  | { toolCallId: string; toolName: string; threw: true };

export function toAgentContinuationStep(
  step: { finishReason: string; content: readonly unknown[] },
  outcomes: readonly AgentToolOutcome[],
): AgentContinuationStep {
  const results = outcomes.map((outcome) =>
    "threw" in outcome
      ? { type: "tool-error", toolCallId: outcome.toolCallId, toolName: outcome.toolName }
      : { type: "tool-result", toolCallId: outcome.toolCallId, toolName: outcome.toolName, output: outcome.output },
  );

  const assistantContent = step.content.filter((part) =>
    ASSISTANT_CONTENT_TYPES.has((part as { type?: string })?.type ?? ""),
  );
  const modelResults = outcomes.map((outcome) => ({
    type: "tool-result" as const,
    toolCallId: outcome.toolCallId,
    toolName: outcome.toolName,
    output: {
      type: "json" as const,
      value: ("threw" in outcome ? { ok: false, result: "The tool failed." } : outcome.output) as never,
    },
  }));

  const responseMessages: ModelMessage[] = [];
  if (assistantContent.length > 0)
    responseMessages.push({ role: "assistant", content: assistantContent } as ModelMessage);
  if (modelResults.length > 0) responseMessages.push({ role: "tool", content: modelResults } as ModelMessage);

  return {
    finishReason: step.finishReason as AgentContinuationStep["finishReason"],
    content: [...step.content, ...results],
    response: { messages: responseMessages },
  };
}
