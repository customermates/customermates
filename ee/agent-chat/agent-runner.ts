import * as Sentry from "@sentry/nextjs";
import { randomUUID } from "node:crypto";

import { streamText, stepCountIs } from "ai";
import type { Prisma } from "@/generated/prisma";

import { getAgentChatRepo, getCreateChatSupportTicketInteractor, getUserService } from "@/core/di";
import { isExpectedErrorInCauseChain } from "@/core/errors/app-errors";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { mcpInteractorFailure, type McpToolExecutionResult } from "@/features/mcp-tools/mcp-tool";

import { buildTurnUsageSettlement, usageToTokenCounts } from "./llm.service";
import { readAgentProviderCharge, readAgentProviderChargeFromError } from "./gateway-cost";
import { computeCostMicrocents, type TokenCounts } from "./model-pricing";
import { buildAgentSystemPrompt } from "./system-prompt";
import {
  getAgentAiTools,
  describeAgentAiTools,
  isAgentToolCancellation,
  type AgentToolDeps,
  type ApprovalDecision,
} from "./agent-tools";
import { sse, type ReplayMessage } from "./agent-stream-utils";
import { describeAgentTool } from "./agent-activity";
import {
  isAgentContextWithinBudget,
  resolveAgentToolResultMaxChars,
  type AgentTurnBudget,
} from "./agent-budget-policy";
import { isAgentTurnTerminalError, type AgentTurnTerminalCode } from "./agent-turn-request";
import { AgentTurnTranscript, type AgentTranscriptEvent } from "./agent-turn-transcript";
import { buildAgentProviderContext, isAgentStepContextWithinBudget } from "./agent-provider-context";
import { agentTranslator, type AgentTranslator } from "./agent-translator";
import { resolveAgentApprovalContext } from "./agent-external-approval-context";
import {
  agentContinuationShouldStop,
  compactAgentContinuationContext,
  decideAgentContinuationLoop,
  type AgentContinuationDecision,
} from "./agent-continuation";
import { internalToolIdentity } from "./tool-identity";

function agentRunnerCopy(t: AgentTranslator) {
  return {
    emptyReply: t("AgentChat.runner.emptyReply"),
    turnError: t("AgentChat.runner.turnError"),
    cancelled: t("AgentChat.runner.cancelled"),
    maxSteps: t("AgentChat.runner.maxSteps"),
    outputLimit: t("AgentChat.runner.outputLimit"),
    safetyLimit: t("AgentChat.runner.safetyLimit"),
  };
}

export type AgentRunContext = {
  companyId: string;
  userId: string;
  runId: string;
  turnRequestId: string;
  userMessageId: string;
  clientRequestId: string;
  userName: string;
  conversationId: string;
  locale: string;
  appBaseUrl: string;
  messages: ReplayMessage[];
  turnBudget: AgentTurnBudget;
  approvalTimeoutMs?: number;
  approvalPollMs?: number;
};

const AGENT_APPROVAL_TIMEOUT_MS = 120_000;
const AGENT_APPROVAL_POLL_MS = 1_000;
const UI_COMMAND_TIMEOUT_MS = 15000;
const UI_COMMAND_POLL_MS = 100;
const AGENT_CONTINUATION_MAX_WRITE_ACTIVITIES = 16;
const AGENT_CONTINUATION_MAX_ERRORS = 3;
const AGENT_CONTINUATION_MAX_NO_PROGRESS_STEPS = 2;
const AGENT_CONTINUATION_MAX_REPEATED_CALLS = 3;
const AGENT_CONTINUATION_MAX_WALL_TIME_MS = 240_000;

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const EMPTY_TOKENS: TokenCounts = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

function addTokens(acc: TokenCounts, part: TokenCounts): TokenCounts {
  return {
    inputTokens: acc.inputTokens + part.inputTokens,
    outputTokens: acc.outputTokens + part.outputTokens,
    cacheReadTokens: acc.cacheReadTokens + part.cacheReadTokens,
    cacheWriteTokens: acc.cacheWriteTokens + part.cacheWriteTokens,
  };
}

function isStructuredToolFailure(output: unknown) {
  return Boolean(
    output &&
      typeof output === "object" &&
      !Array.isArray(output) &&
      "ok" in output &&
      (output as { ok?: unknown }).ok === false,
  );
}

function isAgentTimeoutError(error: unknown) {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 8 && current && typeof current === "object" && !seen.has(current); depth += 1) {
    seen.add(current);
    const candidate = current as { name?: unknown; cause?: unknown };
    if (candidate.name === "TimeoutError") return true;
    current = candidate.cause;
  }
  return false;
}

async function createSupportTicket(
  conversationId: string,
  subject: string,
  body: string,
): Promise<McpToolExecutionResult> {
  const result = await getCreateChatSupportTicketInteractor().invoke({
    conversationId,
    subject,
    body,
  });
  if (result.ok) {
    return {
      ok: true,
      result:
        "Support request email accepted for delivery. The Customermates team will reply to the email address on your account.",
    };
  }

  const failure = mcpInteractorFailure(result.error);
  return {
    ok: false,
    result: "The support request email could not be sent.",
    failure: failure.failure,
  };
}

export function runAgentLane(ctx: AgentRunContext, requestSignal: AbortSignal): ReadableStream<Uint8Array> {
  const laneController = new AbortController();
  const abortLane = () => laneController.abort();
  if (requestSignal.aborted) abortLane();
  else requestSignal.addEventListener("abort", abortLane, { once: true });
  const signal = laneController.signal;
  let consumerCancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let seq = 0;
      const emit = (type: string, payload: Record<string, unknown> = {}) => {
        if (signal.aborted || consumerCancelled) return;
        controller.enqueue(sse(++seq, type, payload));
      };
      const repo = getAgentChatRepo();

      const copy = agentRunnerCopy(agentTranslator(ctx.locale));

      const requestApproval = async (
        _toolCallId: string,
        toolName: string,
        input: unknown,
      ): Promise<ApprovalDecision> => {
        const requestId = randomUUID();
        const deadline = Date.now() + (ctx.approvalTimeoutMs ?? AGENT_APPROVAL_TIMEOUT_MS);
        await repo.createPendingApprovalRequestOrThrowUnscoped({
          conversationId: ctx.conversationId,
          requestId,
          toolName,
          companyId: ctx.companyId,
          userId: ctx.userId,
          expiresAt: new Date(deadline),
        });
        transcript.beginApproval(requestId, describeAgentTool(internalToolIdentity(toolName), input));
        while (!signal.aborted) {
          const approval = await repo.findApprovalDecisionUnscoped({
            conversationId: ctx.conversationId,
            requestId,
            companyId: ctx.companyId,
            userId: ctx.userId,
          });
          if (approval) {
            const decision = approval.toolName === toolName ? approval.decision : "reject";
            transcript.resolveApproval(requestId, decision === "approve" ? "approved" : "rejected", decision);
            return decision;
          }
          if (Date.now() > deadline) {
            await repo.discardPendingApprovalRequestUnscoped({
              conversationId: ctx.conversationId,
              requestId,
              companyId: ctx.companyId,
              userId: ctx.userId,
            });
            transcript.resolveApproval(requestId, "timeout", "timeout");
            return "timeout";
          }
          await delay(ctx.approvalPollMs ?? AGENT_APPROVAL_POLL_MS, signal);
        }
        await repo.discardPendingApprovalRequestUnscoped({
          conversationId: ctx.conversationId,
          requestId,
          companyId: ctx.companyId,
          userId: ctx.userId,
        });
        transcript.setApprovalStatus(requestId, "cancelled");
        return "timeout";
      };

      const runUiCommand = async (commandId: string, name: string, input: Record<string, unknown>) => {
        emit("ui_command", { commandId, name, input });
        const deadline = Date.now() + UI_COMMAND_TIMEOUT_MS;
        while (!signal.aborted) {
          const result = await repo.takeUiCommandResultUnscoped({
            conversationId: ctx.conversationId,
            commandId,
            companyId: ctx.companyId,
            userId: ctx.userId,
          });
          if (result) {
            return result.name === name
              ? { ok: result.ok, result: result.result }
              : {
                  ok: false,
                  result: "The interface response did not match the requested command.",
                };
          }

          if (Date.now() > deadline) {
            return {
              ok: false,
              result: "The interface did not respond to the command.",
            };
          }
          await delay(UI_COMMAND_POLL_MS, signal);
        }
        return { ok: false, result: "The interface command was interrupted." };
      };

      const transcript = new AgentTurnTranscript((event: AgentTranscriptEvent) => emit(event.type, event.payload));
      let tokens = EMPTY_TOKENS;
      let providerStepsStarted = 0;
      let providerStepsFinished = 0;
      let providerAttempted = false;
      let providerBilled = false;
      let roundIndex = 0;
      const stepTokens: TokenCounts[] = [];
      let measuredCostMicrocents: number | null = null;
      let chargeUnreadableReason: string | null = null;
      const accountProviderCharge = (reading: ReturnType<typeof readAgentProviderCharge>) => {
        if (reading.outcome === "notBilled") return;
        providerBilled = true;
        if (reading.outcome === "unreadable") {
          measuredCostMicrocents = null;
          chargeUnreadableReason = reading.reason;
          return;
        }
        if (chargeUnreadableReason === null)
          measuredCostMicrocents = (measuredCostMicrocents ?? 0) + reading.charge.costMicrocents;
      };
      let finishReason: string | undefined;
      const continuationState: { decision: AgentContinuationDecision | null } = { decision: null };
      let turnDone: {
        isError: boolean;
        numTurns: number;
        errorMessage: string | null;
      } | null = null;
      const failUnfinishedTools = (shouldEmit: boolean) =>
        transcript.failUnfinishedTools(signal.aborted ? "cancelled" : "error", shouldEmit);
      try {
        const sessionUser = await getUserService().getActiveUserOrThrow();
        if (sessionUser.companyId !== ctx.companyId || sessionUser.id !== ctx.userId)
          throw new Error("The agent turn was admitted for a different session than the one now running it.");

        const last = ctx.messages.at(-1);
        if (last?.role !== "user") throw new Error("The admitted agent turn is missing its user message.");

        const deps: AgentToolDeps = {
          runUiCommand,
          requestApproval,
          runInCallerContext: (run) => runWithTenant(sessionUser, run),
          runExactlyOnce: async (toolCallId, toolName, run) => {
            const receipt = await repo.claimAgentToolReceiptUnscoped({
              turnRequestId: ctx.turnRequestId,
              companyId: ctx.companyId,
              toolCallId,
              toolName,
            });
            if (receipt.state === "settled") return receipt.resultJson as Awaited<ReturnType<typeof run>>;

            return runInTransaction(async () => {
              const result = await run();
              await repo.settleAgentToolReceiptUnscoped({
                turnRequestId: ctx.turnRequestId,
                companyId: ctx.companyId,
                toolCallId,
                resultJson: result as Prisma.InputJsonValue,
              });
              return result;
            });
          },
          resolveApprovalContext: resolveAgentApprovalContext,
          createSupportTicket: (_toolCallId, subject, body) => createSupportTicket(ctx.conversationId, subject, body),
          resultMaxChars: resolveAgentToolResultMaxChars(ctx.turnBudget.maxToolResultChars),
        };
        const tools = getAgentAiTools(deps);
        const systemPrompt = buildAgentSystemPrompt({
          userName: ctx.userName,
          appBaseUrl: ctx.appBaseUrl,
          locale: ctx.locale,
        });
        const toolDefinitions = describeAgentAiTools(tools);
        const providerContext = buildAgentProviderContext(systemPrompt, ctx.messages, toolDefinitions);
        const modelMessages = providerContext.messages;
        if (!isAgentContextWithinBudget(providerContext, ctx.turnBudget.maxContextBytes))
          throw new Error("The assistant context exceeds its safe turn budget.");

        if (signal.aborted) throw new Error("The agent turn was cancelled before provider access.");
        await repo.markAgentTurnProviderStartedUnscoped({
          turnRequestId: ctx.turnRequestId,
          conversationId: ctx.conversationId,
          companyId: ctx.companyId,
          userId: ctx.userId,
          runId: ctx.runId,
        });
        providerAttempted = true;
        const continuationStartedAtMs = Date.now();
        const result = streamText({
          model: ctx.turnBudget.modelSpec,
          maxRetries: 0,
          maxOutputTokens: ctx.turnBudget.maxOutputTokens,
          timeout: { totalMs: AGENT_CONTINUATION_MAX_WALL_TIME_MS },
          tools,
          providerOptions: {
            gateway: { only: [ctx.turnBudget.servingProvider] },
            openai: { parallelToolCalls: false },
          },
          stopWhen: [
            stepCountIs(ctx.turnBudget.maxSteps),
            ({ steps }) => {
              if (steps.length >= ctx.turnBudget.maxSteps) return false;
              const decision = decideAgentContinuationLoop(
                {
                  startedAtMs: continuationStartedAtMs,
                  steps,
                  observedAtMs: Date.now(),
                },
                {
                  maxProviderSteps: ctx.turnBudget.maxSteps,
                  maxWriteActivities: Math.min(AGENT_CONTINUATION_MAX_WRITE_ACTIVITIES, ctx.turnBudget.maxSteps),
                  maxErrors: AGENT_CONTINUATION_MAX_ERRORS,
                  maxNoProgressSteps: AGENT_CONTINUATION_MAX_NO_PROGRESS_STEPS,
                  maxRepeatedActivityCalls: AGENT_CONTINUATION_MAX_REPEATED_CALLS,
                  maxWallTimeMs: AGENT_CONTINUATION_MAX_WALL_TIME_MS,
                },
              );
              if (decision.action === "error") continuationState.decision = decision;
              return agentContinuationShouldStop(decision);
            },
          ],
          experimental_onStepStart: () => {
            providerStepsStarted += 1;
          },
          onStepEnd: async (step) => {
            const roundTokens = usageToTokenCounts(step.usage);
            const charge = readAgentProviderCharge(step.providerMetadata, ctx.turnBudget.servingProvider);

            await repo.recordAgentRunRoundUnscoped({
              turnRequestId: ctx.turnRequestId,
              companyId: ctx.companyId,
              runId: ctx.runId,
              roundIndex: roundIndex++,
              parts: step.response.messages as unknown as Prisma.InputJsonValue,
              finishReason: step.finishReason,
              ...roundTokens,
              reasoningTokens: step.usage.outputTokenDetails?.reasoningTokens ?? 0,
              costMicrocents:
                charge.outcome === "measured"
                  ? charge.charge.costMicrocents
                  : computeCostMicrocents(ctx.turnBudget.modelSpec, roundTokens, ctx.turnBudget.servingProvider),
              modelSpec: ctx.turnBudget.modelSpec,
              servingProvider: ctx.turnBudget.servingProvider,
            });
          },
          prepareStep: ({ steps = [] }) => {
            const fitsBudget = (context: ReturnType<typeof compactAgentContinuationContext>) =>
              isAgentStepContextWithinBudget(
                { ...providerContext, system: context.system },
                context.messages,
                ctx.turnBudget.maxContextBytes,
              );

            const whole = compactAgentContinuationContext({
              system: providerContext.system,
              initialMessages: modelMessages,
              steps,
              retainedResponseSteps: steps.length,
            });
            if (fitsBudget(whole)) return { system: whole.system, messages: whole.messages };

            const compacted = compactAgentContinuationContext({
              system: providerContext.system,
              initialMessages: modelMessages,
              steps,
            });
            if (!fitsBudget(compacted)) throw new Error("The assistant context exceeds its safe turn budget.");

            return {
              system: compacted.system,
              messages: compacted.messages,
            };
          },
          system: providerContext.system,
          messages: modelMessages,
          abortSignal: signal,
        });

        for await (const part of result.fullStream) {
          if (part.type === "text-delta" && part.text) transcript.pushTextDelta(part.text);
          else if (part.type === "tool-call") {
            transcript.beginToolCall({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              activity: describeAgentTool(internalToolIdentity(part.toolName), part.input),
              invalid: "invalid" in part && part.invalid === true,
            });
          } else if (part.type === "tool-result") {
            const cancelled = isAgentToolCancellation(part.output);
            const failed = !cancelled && isStructuredToolFailure(part.output);
            transcript.completeToolCall({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              status: cancelled ? "cancelled" : failed ? "error" : "done",
              failed,
            });
          } else if (part.type === "tool-error") {
            const { wasInvalidToolCall } = transcript.failToolCall(part.toolCallId);
            if (!wasInvalidToolCall && !isExpectedErrorInCauseChain(part.error)) Sentry.captureException(part.error);
          } else if (part.type === "finish-step") {
            const alive = await repo.heartbeatAgentRunUnscoped({
              turnRequestId: ctx.turnRequestId,
              companyId: ctx.companyId,
              userId: ctx.userId,
              runId: ctx.runId,
            });
            if (!alive) throw new Error("The agent run lease was reclaimed while the turn was still running.");

            const finishedStepTokens = usageToTokenCounts(part.usage);
            stepTokens.push(finishedStepTokens);
            tokens = addTokens(tokens, finishedStepTokens);
            providerStepsFinished += 1;
            accountProviderCharge(readAgentProviderCharge(part.providerMetadata, ctx.turnBudget.servingProvider));
            finishReason = part.finishReason;
          } else if (part.type === "finish") finishReason = part.finishReason;
          else if (part.type === "error") throw part.error;
        }
        transcript.finishTextSegment();
        if (signal.aborted) throw new Error("The agent turn was cancelled.");

        if (transcript.removedToolProtocol) {
          Sentry.captureException(new Error("The assistant emitted tool protocol as visible text."));
          const fallback = copy.turnError;
          const delta = transcript.replyText.trim() ? `\n\n${fallback}` : fallback;
          transcript.appendText(delta);
          emit("delta", { text: delta });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "error",
          };
        } else if (
          continuationState.decision?.action === "error" &&
          continuationState.decision.reason !== "step_limit"
        ) {
          const fallback = copy.safetyLimit;
          const delta = transcript.replyText.trim() ? `\n\n${fallback}` : fallback;
          transcript.appendText(delta);
          emit("delta", { text: delta });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "safety_limit",
          };
        } else if (transcript.replyParts.length === 0) {
          transcript.appendText(copy.emptyReply);
          emit("delta", { text: copy.emptyReply });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "empty_response",
          };
        } else if (finishReason === "tool-calls") {
          const fallback = copy.maxSteps;
          const delta = transcript.replyText.trim() ? `\n\n${fallback}` : fallback;
          transcript.appendText(delta);
          emit("delta", { text: delta });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "max_turns",
          };
        } else if (finishReason === "length") {
          const fallback = copy.outputLimit;
          const delta = transcript.replyText.trim() ? `\n\n${fallback}` : fallback;
          transcript.appendText(delta);
          emit("delta", { text: delta });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "output_limit",
          };
        } else if (finishReason && finishReason !== "stop") {
          const fallback = copy.turnError;
          const delta = transcript.replyText.trim() ? `\n\n${fallback}` : fallback;
          transcript.appendText(delta);
          emit("delta", { text: delta });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "error",
          };
        } else {
          turnDone = {
            isError: false,
            numTurns: 1,
            errorMessage: null,
          };
        }
      } catch (error) {
        if (providerAttempted)
          accountProviderCharge(readAgentProviderChargeFromError(error, ctx.turnBudget.servingProvider));
        transcript.finishTextSegment();
        if (signal.aborted) {
          const fallback = transcript.replyText.trim() ? `\n\n${copy.cancelled}` : copy.cancelled;
          transcript.appendText(fallback);
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "cancelled",
          };
        } else if (isAgentTimeoutError(error)) {
          const fallback = transcript.replyText.trim() ? `\n\n${copy.safetyLimit}` : copy.safetyLimit;
          transcript.appendText(fallback);
          emit("delta", { text: fallback });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "safety_limit",
          };
        } else {
          if (!isExpectedErrorInCauseChain(error)) Sentry.captureException(error);
          const fallback = transcript.replyText.trim() ? `\n\n${copy.turnError}` : copy.turnError;
          transcript.appendText(fallback);
          emit("delta", { text: fallback });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "error",
          };
        }
      } finally {
        failUnfinishedTools(!signal.aborted);
        if (!turnDone) {
          transcript.appendText(signal.aborted ? copy.cancelled : copy.turnError);
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: signal.aborted ? "cancelled" : "error",
          };
        }

        const terminalCode: AgentTurnTerminalCode = signal.aborted
          ? "cancelled"
          : turnDone.errorMessage === "max_turns" ||
              turnDone.errorMessage === "output_limit" ||
              turnDone.errorMessage === "safety_limit"
            ? "partial"
            : turnDone.isError
              ? "error"
              : "completed";
        try {
          const committed = await repo.finalizeAgentTurnOrThrowUnscoped({
            turnRequestId: ctx.turnRequestId,
            conversationId: ctx.conversationId,
            companyId: ctx.companyId,
            userId: ctx.userId,
            runId: ctx.runId,
            parts: transcript.replyParts as unknown as Prisma.InputJsonValue,
            terminalCode,
            affectedResources: transcript.affectedResources,
            usageSettlement: providerAttempted
              ? buildTurnUsageSettlement(ctx.turnBudget.modelSpec, tokens, {
                  provider: ctx.turnBudget.servingProvider,
                  reservedCredits: ctx.turnBudget.reservedCredits,
                  providerCharge: {
                    billed: providerBilled,
                    measuredCostMicrocents:
                      providerStepsStarted > providerStepsFinished ? null : measuredCostMicrocents,
                    stepTokens,
                    unreadableReason: chargeUnreadableReason,
                  },
                })
              : null,
          });
          if (!signal.aborted) {
            emit("message_committed", {
              messageId: committed.assistantMessage.id,
            });
            emit("turn_done", {
              ...turnDone,
              isError: isAgentTurnTerminalError(committed.terminalCode),
              terminalCode: committed.terminalCode,
              assistantMessageId: committed.assistantMessage.id,
              affectedResources: committed.affectedResources,
              creditsUsed: committed.chargedCredits,
              errorMessage: committed.terminalCode === "policyBreach" ? "policy_breach" : turnDone.errorMessage,
            });
          }
        } catch (error) {
          Sentry.captureException(error);
        }
        requestSignal.removeEventListener("abort", abortLane);
        if (!consumerCancelled) controller.close();
      }
    },
    cancel() {
      consumerCancelled = true;
      abortLane();
    },
  });
}
