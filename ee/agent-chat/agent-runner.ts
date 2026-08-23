import * as Sentry from "@sentry/nextjs";
import { randomUUID } from "node:crypto";

import { streamText, stepCountIs } from "ai";
import type { Prisma } from "@/generated/prisma";

import { getAgentChatRepo, getCreateChatSupportTicketInteractor, getUserService } from "@/core/di";
import { isExpectedErrorInCauseChain } from "@/core/errors/app-errors";
import { mcpInteractorFailure, type McpToolExecutionResult } from "@/features/mcp-tools/mcp-tool";

import { buildTurnUsageSettlement, usageToTokenCounts } from "./llm.service";
import { readAgentProviderCharge, readAgentProviderChargeFromError } from "./gateway-cost";
import { type TokenCounts } from "./model-pricing";
import { buildAgentSystemPrompt } from "./system-prompt";
import {
  getAgentAiTools,
  describeAgentAiTools,
  isAgentToolCancellation,
  type AgentToolDeps,
  type ApprovalDecision,
} from "./agent-tools";
import { sse, type ReplayMessage } from "./agent-stream-utils";
import { type AgentMessagePart } from "./agent-chat.schema";
import { describeAgentTool, type AgentActivityResource } from "./agent-activity";
import { AgentVisibleTextStreamSanitizer } from "./agent-output-safety";
import {
  isAgentContextWithinBudget,
  resolveAgentToolResultMaxChars,
  type AgentTurnBudget,
} from "./agent-budget-policy";
import { isAgentTurnTerminalError, type AgentTurnTerminalCode } from "./agent-turn-request";
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
        const activity = describeAgentTool(internalToolIdentity(toolName), input);
        const approvalPart: Extract<AgentMessagePart, { type: "approval" }> = {
          type: "approval",
          id: requestId,
          activity,
          status: "pending",
        };
        approvalParts.set(requestId, approvalPart);
        replyParts.push(approvalPart);
        emit("approval_request", { requestId, activity });
        while (!signal.aborted) {
          const approval = await repo.findApprovalDecisionUnscoped({
            conversationId: ctx.conversationId,
            requestId,
            companyId: ctx.companyId,
            userId: ctx.userId,
          });
          if (approval) {
            const decision = approval.toolName === toolName ? approval.decision : "reject";
            approvalPart.status = decision === "approve" ? "approved" : "rejected";
            emit("approval_resolved", { requestId, decision });
            return decision;
          }
          if (Date.now() > deadline) {
            await repo.discardPendingApprovalRequestUnscoped({
              conversationId: ctx.conversationId,
              requestId,
              companyId: ctx.companyId,
              userId: ctx.userId,
            });
            approvalPart.status = "timeout";
            emit("approval_resolved", { requestId, decision: "timeout" });
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
        approvalPart.status = "cancelled";
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

      let replyText = "";
      let visibleText = new AgentVisibleTextStreamSanitizer();
      const replyParts: AgentMessagePart[] = [];
      const toolParts = new Map<string, Extract<AgentMessagePart, { type: "activity" }>>();
      const invalidToolCallIds = new Set<string>();
      const retryableFailureByTool = new Map<string, string>();
      const approvalParts = new Map<string, Extract<AgentMessagePart, { type: "approval" }>>();
      const affectedResources = new Set<AgentActivityResource>();
      let tokens = EMPTY_TOKENS;
      let providerStepsStarted = 0;
      let providerStepsFinished = 0;
      let providerAttempted = false;
      let providerBilled = false;
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
      let removedToolProtocol = false;
      const continuationState: { decision: AgentContinuationDecision | null } = { decision: null };
      let turnDone: {
        isError: boolean;
        numTurns: number;
        errorMessage: string | null;
      } | null = null;
      const appendReplyText = (text: string) => {
        replyText += text;
        const lastPart = replyParts.at(-1);
        if (lastPart?.type === "text") lastPart.text += text;
        else replyParts.push({ type: "text", text });
      };
      const emitVisibleText = (text: string) => {
        if (!text) return;
        appendReplyText(text);
        emit("delta", { text });
      };
      const finishVisibleTextSegment = () => {
        emitVisibleText(visibleText.finish());
        removedToolProtocol ||= visibleText.removedToolProtocol;
        visibleText = new AgentVisibleTextStreamSanitizer();
      };
      const finishTool = (id: string, status: "done" | "error" | "cancelled") => {
        const toolPart = toolParts.get(id);
        if (!toolPart) return;
        toolPart.status = status;
        if (status === "done" && toolPart.activity.risk !== "read")
          toolPart.activity.affectedResources.forEach((resource) => affectedResources.add(resource));
      };
      const failUnfinishedTools = (shouldEmit: boolean) => {
        for (const [id, toolPart] of toolParts) {
          if (toolPart.status !== "running") continue;
          finishTool(id, signal.aborted ? "cancelled" : "error");
          if (shouldEmit) emit("activity_result", { id, isError: true });
        }
      };
      try {
        const sessionUser = await getUserService().getActiveUserOrThrow();
        if (sessionUser.companyId !== ctx.companyId || sessionUser.id !== ctx.userId)
          throw new Error("The agent turn was admitted for a different session than the one now running it.");

        const last = ctx.messages.at(-1);
        if (last?.role !== "user") throw new Error("The admitted agent turn is missing its user message.");

        const deps: AgentToolDeps = {
          runUiCommand,
          requestApproval,
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
          if (part.type === "text-delta" && part.text) {
            emitVisibleText(visibleText.push(part.text));
            removedToolProtocol ||= visibleText.removedToolProtocol;
          } else if (part.type === "tool-call") {
            if ("invalid" in part && part.invalid) invalidToolCallIds.add(part.toolCallId);
            finishVisibleTextSegment();
            const supersededId = retryableFailureByTool.get(part.toolName);
            if (supersededId) {
              retryableFailureByTool.delete(part.toolName);
              const supersededPart = toolParts.get(supersededId);
              const supersededIndex = supersededPart ? replyParts.indexOf(supersededPart) : -1;
              if (supersededIndex >= 0) replyParts.splice(supersededIndex, 1);
              toolParts.delete(supersededId);
              emit("activity_superseded", { id: supersededId });
            }
            const activity = describeAgentTool(internalToolIdentity(part.toolName), part.input);
            const toolPart: Extract<AgentMessagePart, { type: "activity" }> = {
              type: "activity",
              id: part.toolCallId,
              activity,
              status: "running",
            };
            toolParts.set(part.toolCallId, toolPart);
            replyParts.push(toolPart);
            emit("activity", {
              id: part.toolCallId,
              activity,
            });
          } else if (part.type === "tool-result") {
            const cancelled = isAgentToolCancellation(part.output);
            const failed = !cancelled && isStructuredToolFailure(part.output);
            const status = cancelled ? "cancelled" : failed ? "error" : "done";
            if (failed && part.toolName) retryableFailureByTool.set(part.toolName, part.toolCallId);
            finishTool(part.toolCallId, status);
            emit("activity_result", {
              id: part.toolCallId,
              isError: failed,
              status,
            });
          } else if (part.type === "tool-error") {
            if (!invalidToolCallIds.delete(part.toolCallId) && !isExpectedErrorInCauseChain(part.error))
              Sentry.captureException(part.error);
            finishTool(part.toolCallId, "error");
            emit("activity_result", {
              id: part.toolCallId,
              isError: true,
            });
          } else if (part.type === "finish-step") {
            const finishedStepTokens = usageToTokenCounts(part.usage);
            stepTokens.push(finishedStepTokens);
            tokens = addTokens(tokens, finishedStepTokens);
            providerStepsFinished += 1;
            accountProviderCharge(readAgentProviderCharge(part.providerMetadata, ctx.turnBudget.servingProvider));
            finishReason = part.finishReason;
          } else if (part.type === "finish") finishReason = part.finishReason;
          else if (part.type === "error") throw part.error;
        }
        finishVisibleTextSegment();
        if (signal.aborted) throw new Error("The agent turn was cancelled.");

        if (removedToolProtocol) {
          Sentry.captureException(new Error("The assistant emitted tool protocol as visible text."));
          const fallback = copy.turnError;
          const delta = replyText.trim() ? `\n\n${fallback}` : fallback;
          appendReplyText(delta);
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
          const delta = replyText.trim() ? `\n\n${fallback}` : fallback;
          appendReplyText(delta);
          emit("delta", { text: delta });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "safety_limit",
          };
        } else if (replyParts.length === 0) {
          appendReplyText(copy.emptyReply);
          emit("delta", { text: copy.emptyReply });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "empty_response",
          };
        } else if (finishReason === "tool-calls") {
          const fallback = copy.maxSteps;
          const delta = replyText.trim() ? `\n\n${fallback}` : fallback;
          appendReplyText(delta);
          emit("delta", { text: delta });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "max_turns",
          };
        } else if (finishReason === "length") {
          const fallback = copy.outputLimit;
          const delta = replyText.trim() ? `\n\n${fallback}` : fallback;
          appendReplyText(delta);
          emit("delta", { text: delta });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "output_limit",
          };
        } else if (finishReason && finishReason !== "stop") {
          const fallback = copy.turnError;
          const delta = replyText.trim() ? `\n\n${fallback}` : fallback;
          appendReplyText(delta);
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
        finishVisibleTextSegment();
        if (signal.aborted) {
          const fallback = replyText.trim() ? `\n\n${copy.cancelled}` : copy.cancelled;
          appendReplyText(fallback);
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "cancelled",
          };
        } else if (isAgentTimeoutError(error)) {
          const fallback = replyText.trim() ? `\n\n${copy.safetyLimit}` : copy.safetyLimit;
          appendReplyText(fallback);
          emit("delta", { text: fallback });
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "safety_limit",
          };
        } else {
          if (!isExpectedErrorInCauseChain(error)) Sentry.captureException(error);
          const fallback = replyText.trim() ? `\n\n${copy.turnError}` : copy.turnError;
          appendReplyText(fallback);
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
          appendReplyText(signal.aborted ? copy.cancelled : copy.turnError);
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
            parts: replyParts as unknown as Prisma.InputJsonValue,
            terminalCode,
            affectedResources: Array.from(affectedResources),
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
