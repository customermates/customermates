import * as Sentry from "@sentry/nextjs";
import { randomUUID } from "node:crypto";

import { streamText, stepCountIs } from "ai";
import type { Prisma } from "@/generated/prisma";

import { getAgentChatRepo, getCreateChatSupportTicketInteractor, getUserService } from "@/core/di";

import { env } from "@/env";

import { buildLaneUsageSettlement, hasProviderUsageEvidence, laneModel, usageToTokenCounts } from "./llm.service";
import { type TokenCounts } from "./model-pricing";
import { buildAgentSystemPrompt } from "./system-prompt";
import {
  getAgentAiTools,
  describeAgentAiTools,
  isAgentToolCancellation,
  type AgentToolDeps,
  type AgentToolOutcome,
  type ApprovalDecision,
} from "./agent-tools";
import { sse, type ReplayMessage } from "./agent-stream-utils";
import { type AgentMessagePart } from "./agent-chat.schema";
import { describeAgentTool, isAgentToolRememberable, type AgentActivityResource } from "./agent-activity";
import { AgentVisibleTextStreamSanitizer } from "./agent-output-safety";
import {
  PrepareAgentWorkspaceSetupSchema,
  buildAgentWorkspaceSetupPlan,
  hashAgentWorkspaceSetupPlan,
} from "./agent-workspace-setup";
import {
  isAgentContextWithinBudget,
  resolveAgentToolResultMaxChars,
  type AgentTurnBudget,
} from "./agent-budget-policy";
import { isAgentTurnTerminalError, type AgentTurnTerminalCode } from "./agent-turn-request";
import { buildAgentProviderContext } from "./agent-provider-context";
import { agentSetupTranslator } from "./agent-setup-translator";

function agentRunnerCopy(locale: string) {
  if (locale.toLowerCase().startsWith("de")) {
    return {
      emptyReply: "Ich konnte keine Antwort erstellen. Bitte versuche es erneut.",
      turnError: "Ich konnte diese Anfrage nicht abschließen. Bitte versuche es erneut.",
      cancelled: "Diese Antwort wurde gestoppt.",
      maxSteps:
        "Ich konnte das nicht innerhalb der erlaubten Schritte abschließen. Für größere Aufgaben kannst du deinen eigenen KI-Agenten über MCP mit Customermates verbinden.",
    };
  }
  return {
    emptyReply: "I couldn't produce a response. Please try again.",
    turnError: "I couldn't complete that request. Please try again.",
    cancelled: "This response was stopped.",
    maxSteps:
      "I couldn't finish this within the allowed number of steps. For larger jobs, connect your own AI agent to Customermates over MCP.",
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
  preAuthorized: string[];
  toolNames: string[];
  messages: ReplayMessage[];
  turnBudget: AgentTurnBudget;
};

const UI_COMMAND_TIMEOUT_MS = 10000;
const UI_COMMAND_POLL_MS = 100;

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

async function createSupportTicket(
  conversationId: string,
  turnRequestId: string,
  toolCallId: string,
  subject: string,
  body: string,
): Promise<AgentToolOutcome> {
  const result = await getCreateChatSupportTicketInteractor().invoke({
    conversationId,
    turnRequestId,
    toolCallId,
    subject,
    body,
  });
  return result.ok
    ? {
        ok: true,
        result: `Support ticket #${result.data.number} opened. The Customermates team will follow up here and by email.`,
      }
    : { ok: false, result: "The support ticket could not be created." };
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

      const preAuthorized = new Set(ctx.preAuthorized);
      const copy = agentRunnerCopy(ctx.locale);

      const requestApproval = async (
        _toolCallId: string,
        toolName: string,
        input: unknown,
      ): Promise<ApprovalDecision> => {
        const requestId = randomUUID();
        const deadline = Date.now() + env.AGENT_APPROVAL_TIMEOUT_MS;
        await repo.createPendingApprovalRequestOrThrowUnscoped({
          conversationId: ctx.conversationId,
          requestId,
          toolName,
          companyId: ctx.companyId,
          userId: ctx.userId,
          expiresAt: new Date(deadline),
        });
        const activity = describeAgentTool(toolName, input);
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
          await delay(env.AGENT_APPROVAL_POLL_MS, signal);
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
      const approvalParts = new Map<string, Extract<AgentMessagePart, { type: "approval" }>>();
      const setupParts = new Map<string, Extract<AgentMessagePart, { type: "workspace_setup" }>>();
      const affectedResources = new Set<AgentActivityResource>();
      let tokens = EMPTY_TOKENS;
      let providerStepsObserved = 0;
      let everyProviderStepHasUsageEvidence = true;
      let providerAttempted = false;
      let providerCompleted = false;
      let finishReason: string | undefined;
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
        visibleText = new AgentVisibleTextStreamSanitizer();
      };
      const finishTool = (id: string, status: "done" | "error" | "cancelled") => {
        const toolPart = toolParts.get(id);
        if (!toolPart) return;
        toolPart.status = status;
        const setupPart = setupParts.get(id);
        if (setupPart) setupPart.status = status === "done" ? "ready" : "failed";
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

        const last = [...ctx.messages].reverse().find((message) => message.role !== "support");
        if (last?.role !== "user") throw new Error("The admitted agent turn is missing its user message.");

        const deps: AgentToolDeps = {
          runUiCommand,
          requestApproval,
          isPreAuthorized: (name) => preAuthorized.has(name) && isAgentToolRememberable(name),
          createSupportTicket: (toolCallId, subject, body) =>
            createSupportTicket(ctx.conversationId, ctx.turnRequestId, toolCallId, subject, body),
          resultMaxChars: resolveAgentToolResultMaxChars(ctx.turnBudget.maxToolResultChars),
        };
        const tools = getAgentAiTools(deps, ctx.toolNames);
        const systemPrompt = buildAgentSystemPrompt({
          userName: ctx.userName,
          appBaseUrl: ctx.appBaseUrl,
        });
        const toolDefinitions = describeAgentAiTools(tools);
        const providerContext = buildAgentProviderContext(systemPrompt, ctx.messages, toolDefinitions);
        const modelMessages = providerContext.messages;
        if (!isAgentContextWithinBudget(providerContext, ctx.turnBudget.maxContextBytes))
          throw new Error("The assistant context exceeds its safe turn budget.");
        if (signal.aborted) throw new Error("The agent turn was cancelled before provider access.");
        const model = laneModel("agent");
        await repo.markAgentTurnProviderStartedUnscoped({
          turnRequestId: ctx.turnRequestId,
          conversationId: ctx.conversationId,
          companyId: ctx.companyId,
          userId: ctx.userId,
          runId: ctx.runId,
        });
        providerAttempted = true;
        const result = streamText({
          model,
          maxRetries: 0,
          maxOutputTokens: ctx.turnBudget.maxOutputTokens,
          tools,
          stopWhen: stepCountIs(ctx.turnBudget.maxSteps),
          prepareStep: ({ messages }) => {
            if (!isAgentContextWithinBudget({ ...providerContext, messages }, ctx.turnBudget.maxContextBytes))
              throw new Error("The assistant context exceeds its safe turn budget.");

            return undefined;
          },
          messages: modelMessages,
          abortSignal: signal,
        });

        for await (const part of result.fullStream) {
          if (part.type === "text-delta" && part.text) emitVisibleText(visibleText.push(part.text));
          else if (part.type === "tool-call") {
            finishVisibleTextSegment();
            const activity = describeAgentTool(part.toolName, part.input);
            const toolPart: Extract<AgentMessagePart, { type: "activity" }> = {
              type: "activity",
              id: part.toolCallId,
              activity,
              status: "running",
            };
            toolParts.set(part.toolCallId, toolPart);
            replyParts.push(toolPart);
            if (part.toolName === "open_workspace_setup") {
              const setup = PrepareAgentWorkspaceSetupSchema.safeParse(part.input);
              if (setup.success) {
                const plan = buildAgentWorkspaceSetupPlan(setup.data, agentSetupTranslator(ctx.locale));
                const setupPart: Extract<AgentMessagePart, { type: "workspace_setup" }> = {
                  type: "workspace_setup",
                  id: part.toolCallId,
                  setup: setup.data,
                  plan,
                  planHash: await hashAgentWorkspaceSetupPlan(plan),
                  status: "preparing",
                };
                setupParts.set(part.toolCallId, setupPart);
                replyParts.push(setupPart);
              }
            }
            emit("activity", {
              id: part.toolCallId,
              activity,
            });
          } else if (part.type === "tool-result") {
            const cancelled = isAgentToolCancellation(part.output);
            const failed = !cancelled && isStructuredToolFailure(part.output);
            const status = cancelled ? "cancelled" : failed ? "error" : "done";
            finishTool(part.toolCallId, status);
            emit("activity_result", {
              id: part.toolCallId,
              isError: failed,
              status,
            });
          } else if (part.type === "tool-error") {
            Sentry.captureException(part.error);
            finishTool(part.toolCallId, "error");
            emit("activity_result", {
              id: part.toolCallId,
              isError: true,
            });
          } else if (part.type === "finish-step") {
            tokens = addTokens(tokens, usageToTokenCounts(part.usage));
            providerStepsObserved += 1;
            everyProviderStepHasUsageEvidence &&= hasProviderUsageEvidence(part.usage);
            finishReason = part.finishReason;
          } else if (part.type === "finish") finishReason = part.finishReason;
          else if (part.type === "error") throw part.error;
        }
        finishVisibleTextSegment();
        providerCompleted = !signal.aborted;
        if (signal.aborted) throw new Error("The agent turn was cancelled.");

        if (replyParts.length === 0) {
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
        } else {
          turnDone = {
            isError: false,
            numTurns: 1,
            errorMessage: null,
          };
        }
      } catch (error) {
        finishVisibleTextSegment();
        if (signal.aborted) {
          const fallback = replyText.trim() ? `\n\n${copy.cancelled}` : copy.cancelled;
          appendReplyText(fallback);
          turnDone = {
            isError: true,
            numTurns: 1,
            errorMessage: "cancelled",
          };
        } else {
          Sentry.captureException(error);
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
          : turnDone.errorMessage === "max_turns"
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
              ? buildLaneUsageSettlement("agent", tokens, {
                  reservedCredits: ctx.turnBudget.reservedCredits,
                  retainReservation:
                    !providerCompleted || providerStepsObserved === 0 || !everyProviderStepHasUsageEvidence,
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
