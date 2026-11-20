import type { JSONValue, LanguageModel, LanguageModelUsage, ModelMessage, ToolSet } from "ai";
import type { AgentJobFinishReason } from "@/features/agent-jobs/agent-job.schema";
import type { AgentMeasuredContext, AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { ClassifierCharge } from "@/ee/agent-chat/classifier/metered";
import type { TokenCounts } from "@/ee/agent-chat/model-pricing";
import type { AgentJobToolDefinition } from "./agent-job-context";
import type { AgentJobRecorder } from "./agent-job-recorder";

import { generateText, isStepCount } from "ai";

import { AGENT_SYSTEM_CACHE_CONTROL, AGENT_TOOLS_CACHE_CONTROL } from "@/ee/agent-chat/agent-prompt-cache";
import { onDemandToolsetOfTool } from "@/ee/agent-chat/agent-toolsets";
import { usageToTokenCounts } from "@/ee/agent-chat/agent-usage-settlement";
import { collectClassifierCharges } from "@/ee/agent-chat/classifier/metered";

import { agentJobToolDefinitions, fitAgentJobContext } from "./agent-job-context";
import { type AgentJobStopCode, agentJobErrorStatus } from "./agent-job-failure";

export const AGENT_JOB_MAX_STEPS = 40;
const PROVIDER_MAX_RETRIES = 1;
const NO_TOKENS: TokenCounts = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
const REPORT_NOTE =
  "The limit of this run is reached and no further tool call is possible. Report now what is done and what remains.";
const HALTED = new Error("The agent job was halted before its next round.");

export type AgentJobStepUsage = {
  tokens: TokenCounts;
  providerMetadata: unknown;
  unmeasuredMicrocents?: number;
};

export type AgentJobLoopLimits = {
  maxOutputTokens: number;
  maxContextBytes: number;
  reasoning?: AgentTurnBudget["reasoningEffort"];
};

export type AgentJobRound = {
  steps: readonly AgentJobStepUsage[];
  auxiliary: readonly ClassifierCharge[];
  contextBytes: number;
  measured: AgentMeasuredContext | null;
};

export type AgentJobRoundAdmission =
  | { admitted: true; roundReserveMicrocents: number }
  | { admitted: false; reason: "creditLimit" | "hostedAiUnavailable" };

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
  limits?: AgentJobLoopLimits;
  admitRound?: (round: AgentJobRound) => Promise<AgentJobRoundAdmission>;
  anthropicCache?: boolean;
  onStep: (step: AgentJobStepUsage) => Promise<{ held: boolean }>;
};

type Ended = { steps: AgentJobStepUsage[]; auxiliary: ClassifierCharge[] };

export type AgentJobLoopOutcome =
  | ({ kind: "finished"; text: string; reason: AgentJobFinishReason } & Ended)
  | ({ kind: "stopped"; code: AgentJobStopCode } & Ended)
  | ({ kind: "failed"; error: unknown } & Ended);

type Execute = (input: unknown, options: { toolCallId: string }) => unknown;

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function promptTokensOf(tokens: TokenCounts): number {
  return tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens;
}

export async function runAgentJobLoop(input: AgentJobLoopInput): Promise<AgentJobLoopOutcome> {
  const steps: AgentJobStepUsage[] = [];
  const auxiliary: ClassifierCharge[] = [];
  let stopped = null as AgentJobFinishReason | null;
  let lastText = "";
  let refused = false;
  let callsStarted = 0;
  let roundReserveMicrocents = undefined as number | undefined;
  let roundContextBytes = 0;
  let measured = null as AgentMeasuredContext | null;
  let definitions = null as Map<string, AgentJobToolDefinition> | null;
  let callbackFailure = null as { error: unknown } | null;
  let halt = null as "creditLimit" | AgentJobStopCode | null;

  const inCallback = async (run: () => void | Promise<void>) => {
    try {
      await run();
    } catch (error) {
      callbackFailure ??= { error };
    }
  };

  const cachedTool = input.anthropicCache
    ? Object.keys(input.tools).findLast((name) => onDemandToolsetOfTool(name) === null)
    : undefined;
  const instructions = input.anthropicCache
    ? { role: "system" as const, content: input.system, providerOptions: AGENT_SYSTEM_CACHE_CONTROL }
    : input.system;

  const tools = Object.fromEntries(
    Object.entries(input.tools).map(([name, definition]) => {
      const execute = (definition as { execute?: Execute }).execute;
      const cached = name === cachedTool ? { providerOptions: AGENT_TOOLS_CACHE_CONTROL } : {};
      if (typeof execute !== "function") return [name, { ...definition, ...cached }];
      return [
        name,
        {
          ...definition,
          ...cached,
          execute: async (toolInput: unknown, options: { toolCallId: string }) => {
            if (input.recorder.toolCalls >= input.maxToolCalls) refused = true;
            const metered = await collectClassifierCharges(() => Promise.resolve(execute(toolInput, options)));
            auxiliary.push(...metered.charges);
            return metered.value;
          },
        },
      ];
    }),
  ) as ToolSet;

  const unmeasuredStep = (providerMetadata: unknown): AgentJobStepUsage => ({
    tokens: NO_TOKENS,
    providerMetadata,
    ...(roundReserveMicrocents === undefined ? {} : { unmeasuredMicrocents: roundReserveMicrocents }),
  });

  const recordUsage = (usage: LanguageModelUsage, providerMetadata: unknown) => {
    try {
      const tokens = usageToTokenCounts(usage);
      steps.push({ tokens, providerMetadata });
      measured = { contextBytes: roundContextBytes, promptTokens: promptTokensOf(tokens) };
    } catch {
      steps.push(unmeasuredStep(providerMetadata));
    }
  };

  const fitContext = async (messages: ModelMessage[], activeTools: string[], system: string) => {
    if (!input.limits) return messages;
    definitions ??= await agentJobToolDefinitions(input.tools);
    const fitted = fitAgentJobContext({
      system,
      messages,
      tools: activeTools.flatMap((name) => definitions?.get(name) ?? []),
      maxContextBytes: input.limits.maxContextBytes,
    });
    if (!fitted) {
      halt = "contextLimit";
      throw HALTED;
    }
    roundContextBytes = fitted.contextBytes;
    return fitted.messages;
  };

  const ended = (): Ended => {
    if (callsStarted > steps.length && roundReserveMicrocents !== undefined) steps.push(unmeasuredStep(undefined));
    return { steps, auxiliary };
  };

  try {
    const result = await generateText({
      model: input.model,
      instructions,
      prompt: input.prompt,
      tools,
      maxRetries: PROVIDER_MAX_RETRIES,
      abortSignal: AbortSignal.timeout(input.wallMs),
      ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
      ...(input.limits ? { maxOutputTokens: input.limits.maxOutputTokens } : {}),
      ...(input.limits?.reasoning ? { reasoning: input.limits.reasoning } : {}),
      prepareStep: async ({ messages, stepNumber }) => {
        if (callbackFailure) throw callbackFailure.error;
        if (halt) throw HALTED;
        const reportOnly = refused || stepNumber >= AGENT_JOB_MAX_STEPS - 1;
        if (reportOnly) stopped = "toolLimit";
        const activeTools = reportOnly ? [] : input.activeToolNames();
        const system = reportOnly ? `${input.system}\n\n${REPORT_NOTE}` : input.system;
        const stepMessages = await fitContext(messages, activeTools, system);
        if (input.admitRound) {
          const admission = await input.admitRound({ steps, auxiliary, contextBytes: roundContextBytes, measured });
          if (!admission.admitted) {
            halt = admission.reason;
            throw HALTED;
          }
          roundReserveMicrocents = admission.roundReserveMicrocents;
        }
        return {
          activeTools,
          ...(reportOnly ? { toolChoice: "none" as const, instructions: system } : {}),
          ...(stepMessages === messages ? {} : { messages: stepMessages }),
        };
      },
      stopWhen: [isStepCount(AGENT_JOB_MAX_STEPS)],
      onLanguageModelCallStart: () => {
        callsStarted += 1;
      },
      onLanguageModelCallEnd: (call) => inCallback(() => recordUsage(call.usage, call.providerMetadata)),
      onStepFinish: (step) =>
        inCallback(async () => {
          if (step.text) {
            lastText = step.text;
            input.recorder.message("assistant", step.text);
          }
          const usage = steps.at(-1);
          if (usage && !(await input.onStep(usage)).held) halt ??= "takenOver";
        }),
    });
    if (callbackFailure) return { kind: "failed", error: callbackFailure.error, ...ended() };
    const cut = !stopped && result.steps.length >= AGENT_JOB_MAX_STEPS && result.finishReason === "tool-calls";
    return {
      kind: "finished",
      text: result.text || lastText,
      reason: cut ? "toolLimit" : (stopped ?? "stop"),
      ...ended(),
    };
  } catch (error) {
    if (error === HALTED && halt) {
      if (halt === "creditLimit") return { kind: "finished", text: lastText, reason: "creditLimit", ...ended() };
      return { kind: "stopped", code: halt, ...ended() };
    }
    if (isTimeout(error)) return { kind: "finished", text: lastText, reason: "timeLimit", ...ended() };
    if (agentJobErrorStatus(error) !== null) return { kind: "failed", error, steps, auxiliary };
    return { kind: "failed", error, ...ended() };
  }
}
