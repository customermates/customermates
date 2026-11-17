import type { JSONValue, LanguageModel, ToolSet } from "ai";
import type { AgentJobFinishReason } from "@/features/agent-jobs/agent-job.schema";
import type { TokenCounts } from "@/ee/agent-chat/model-pricing";
import type { AgentJobRecorder } from "./agent-job-recorder";

import { generateText, isStepCount } from "ai";

import { usageToTokenCounts } from "@/ee/agent-chat/agent-usage-settlement";

export const AGENT_JOB_MAX_STEPS = 40;
const PROVIDER_MAX_RETRIES = 1;

export type AgentJobStepUsage = {
  tokens: TokenCounts;
  providerMetadata: unknown;
};

export type AgentJobLoopInput = {
  model: LanguageModel;
  providerOptions?: Record<string, Record<string, JSONValue>>;
  system: string;
  prompt: string;
  tools: ToolSet;
  activeToolNames: () => string[];
  recorder: AgentJobRecorder;
  maxToolCalls: number;
  wallMs: number;
  outOfBudget?: (steps: readonly AgentJobStepUsage[]) => boolean;
  onStep: (step: AgentJobStepUsage) => Promise<void>;
};

export type AgentJobLoopOutcome =
  | { kind: "finished"; text: string; reason: AgentJobFinishReason; steps: AgentJobStepUsage[] }
  | { kind: "failed"; error: unknown; steps: AgentJobStepUsage[] };

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export async function runAgentJobLoop(input: AgentJobLoopInput): Promise<AgentJobLoopOutcome> {
  const steps: AgentJobStepUsage[] = [];
  let stopped: AgentJobFinishReason | null = null;
  let lastText = "";

  try {
    const result = await generateText({
      model: input.model,
      system: input.system,
      prompt: input.prompt,
      tools: input.tools,
      maxRetries: PROVIDER_MAX_RETRIES,
      abortSignal: AbortSignal.timeout(input.wallMs),
      ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
      prepareStep: () => ({ activeTools: input.activeToolNames() }),
      stopWhen: [
        () => {
          if (input.recorder.toolCalls < input.maxToolCalls) return false;
          stopped = "toolLimit";
          return true;
        },
        () => {
          if (!input.outOfBudget?.(steps)) return false;
          stopped = "creditLimit";
          return true;
        },
        isStepCount(AGENT_JOB_MAX_STEPS),
      ],
      onStepFinish: async (step) => {
        const usage: AgentJobStepUsage = {
          tokens: usageToTokenCounts(step.usage),
          providerMetadata: step.providerMetadata,
        };
        steps.push(usage);
        if (step.text) {
          lastText = step.text;
          input.recorder.message("assistant", step.text);
        }
        await input.onStep(usage);
      },
    });
    return { kind: "finished", text: result.text || lastText, reason: stopped ?? "stop", steps };
  } catch (error) {
    if (!isTimeout(error)) return { kind: "failed", error, steps };
    return { kind: "finished", text: lastText, reason: "timeLimit", steps };
  }
}
