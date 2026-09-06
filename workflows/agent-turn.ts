import type { Prisma } from "@/generated/prisma";
import type { AgentToolDeps } from "@/ee/agent-chat/agent-tools";
import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { AgentActivityResource } from "@/ee/agent-chat/agent-activity";
import type { AgentTranscriptEvent } from "@/ee/agent-chat/agent-turn-transcript";
import type { AgentTurnTerminalEvent } from "@/ee/agent-chat/agent-durable-stream";
import type { ReplayMessage } from "@/ee/agent-chat/agent-stream-utils";
import type { TokenCounts } from "@/ee/agent-chat/model-pricing";
import type { WorkflowTenant } from "./workflow-tenant";

import { WorkflowAgent } from "@ai-sdk/workflow";
import { createHook, getWritable, sleep } from "workflow";
import { isStepCount, jsonSchema } from "ai";

import { AgentTurnTranscript } from "@/ee/agent-chat/agent-turn-transcript";
import { isAgentTurnTerminalError } from "@/ee/agent-chat/agent-turn-request";
import {
  agentApprovalHookToken,
  agentApprovalRequestId,
  isRelevantAgentApprovalWake,
  pendingApprovalCalls,
  toolApprovalDecisionForGrant,
  withApprovalResponses,
  withToolResults,
  type AgentApprovalOutcome,
  type AgentApprovalWake,
  type AgentToolResumeResult,
  type ToolApprovalGrant,
} from "@/ee/agent-chat/agent-approval-resume";
import { agentUiCommandHookToken, isAgentPanelTool, toAgentUiCommandInput } from "@/ee/agent-chat/agent-ui-command";
import { buildAgentProviderContext } from "@/ee/agent-chat/agent-provider-context";
import { buildAgentSystemPrompt } from "@/ee/agent-chat/system-prompt";
import { buildAgentUsageSettlement, usageToTokenCounts } from "@/ee/agent-chat/agent-usage-settlement";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";
import { agentCreditsForStartedProviderCost } from "@/ee/agent-chat/agent-credit-policy";
import { createAgentSupportTicket } from "@/ee/agent-chat/agent-support-ticket";
import { describeAgentTool } from "@/ee/agent-chat/agent-activity";
import { agentToolOutcomeStatus, AGENT_TRANSCRIPT_FORWARDED_EVENTS } from "@/ee/agent-chat/agent-durable-stream";
import {
  agentContinuationLimits,
  toAgentContinuationStep,
  type AgentToolOutcome,
} from "@/ee/agent-chat/agent-run-limits";
import {
  compactAgentContinuationContext,
  decideAgentContinuationLoop,
  type AgentContinuationStep,
} from "@/ee/agent-chat/agent-continuation";
import { isAgentStepContextWithinBudget } from "@/ee/agent-chat/agent-provider-context";
import { getAgentChatRepo } from "@/core/di";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { requiresApproval } from "@/ee/agent-chat/gated-tools";
import { createAgentToolInputResolver, type AgentToolInputResult } from "@/ee/agent-chat/agent-tool-input";
import { resolveAgentApprovalContext } from "@/ee/agent-chat/agent-external-approval-context";
import { resolveAgentToolResultMaxChars } from "@/ee/agent-chat/agent-budget-policy";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { runInTransaction } from "@/core/decorators/transaction-runner";

import { reportFailure, toWorkflowFailure, type WorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "agent-turn";

export const AGENT_APPROVAL_WINDOW_MS = 30 * 60 * 1000;
export const AGENT_UI_COMMAND_WINDOW_MS = 30 * 1000;
export const AGENT_SEGMENT_ROUNDS = 32;

export type AgentTurnWorkflowPayload = {
  turnRequestId: string;
  conversationId: string;
  runId: string;
  companyId: string;
  userId: string;
  userName: string;
  locale: string;
  appBaseUrl: string;
  messages: ReplayMessage[];
  turnBudget: AgentTurnBudget;
  tenant: WorkflowTenant;
};

type AgentToolShell = {
  name: string;
  description: string | undefined;
  inputSchema: unknown;
  annotations: Record<string, boolean> | undefined;
  gated: boolean;
};

type PendingApproval = {
  requestId: string;
  toolCallId: string;
  toolName: string;
  input: unknown;
};

type AgentRoundResult = {
  content: unknown[];
  finishReason: string;
  usage: Parameters<typeof usageToTokenCounts>[0] & {
    outputTokenDetails?: { reasoningTokens?: number };
  };
  providerMetadata: Parameters<typeof readAgentProviderCharge>[0];
};

type RoundLedgerEntry = {
  tokens: TokenCounts;
  costMicrocents: number;
  measured: boolean;
  unreadableReason?: string;
};

function emptyTokens(): TokenCounts {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
}

function addTokens(left: TokenCounts, right: TokenCounts): TokenCounts {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  };
}

function backgroundToolDeps(payload: AgentTurnWorkflowPayload, grant: ToolApprovalGrant): AgentToolDeps {
  const repo = getAgentChatRepo();

  return {
    resultMaxChars: resolveAgentToolResultMaxChars(payload.turnBudget.maxToolResultChars),
    runInCallerContext: (run) => runAsBackgroundTenant(payload.userId, run),
    resolveApprovalContext: resolveAgentApprovalContext,
    requestApproval: () => Promise.resolve(toolApprovalDecisionForGrant(grant)),
    runUiCommand: () =>
      Promise.resolve({
        ok: false,
        result: "Interface control is only available while the panel is open.",
      }),
    createSupportTicket: (_toolCallId, subject, body) =>
      createAgentSupportTicket(payload.conversationId, subject, body),
    runExactlyOnce: async (toolCallId, toolName, run) => {
      const receipt = await repo.claimAgentToolReceiptUnscoped({
        turnRequestId: payload.turnRequestId,
        companyId: payload.companyId,
        toolCallId,
        toolName,
      });
      if (receipt.state === "settled") return receipt.resultJson as Awaited<ReturnType<typeof run>>;

      return runInTransaction(async () => {
        const result = await run();
        await repo.settleAgentToolReceiptUnscoped({
          turnRequestId: payload.turnRequestId,
          companyId: payload.companyId,
          toolCallId,
          resultJson: result as Prisma.InputJsonValue,
        });
        return result;
      });
    },
  };
}

async function openTurn(payload: AgentTurnWorkflowPayload): Promise<boolean> {
  "use step";
  return runAsBackgroundTenant(payload.userId, () =>
    getAgentChatRepo().markAgentTurnProviderStartedUnscoped({
      turnRequestId: payload.turnRequestId,
      conversationId: payload.conversationId,
      companyId: payload.companyId,
      userId: payload.userId,
      runId: payload.runId,
    }),
  );
}
openTurn.maxRetries = 0;

async function canStartNextHostedAiProviderRound(payload: AgentTurnWorkflowPayload): Promise<boolean> {
  "use step";
  return runAsBackgroundTenant(payload.userId, () =>
    getAgentChatRepo().canStartNextHostedAiProviderRoundUnscoped({
      turnRequestId: payload.turnRequestId,
      companyId: payload.companyId,
      userId: payload.userId,
    }),
  );
}
canStartNextHostedAiProviderRound.maxRetries = 0;

async function loadAgentToolShells(): Promise<AgentToolShell[]> {
  "use step";
  const { getAgentAiToolDefinitions } = await import("@/ee/agent-chat/agent-tools");
  const { ALL_MCP_TOOLS } = await import("@/features/mcp-tools/tool-registry");
  const gatedByName = new Map(ALL_MCP_TOOLS.map((mcp) => [mcp.name, mcp.annotations]));

  return getAgentAiToolDefinitions().map((definition) => ({
    name: definition.name,
    description: definition.description,
    inputSchema: definition.inputSchema,
    annotations: gatedByName.get(definition.name),
    gated: gatedByName.has(definition.name),
  }));
}

async function executeAgentTool(
  payload: AgentTurnWorkflowPayload,
  toolName: string,
  toolCallId: string,
  input: unknown,
  grant: ToolApprovalGrant,
): Promise<unknown> {
  "use step";
  const { getAgentAiTools } = await import("@/ee/agent-chat/agent-tools");
  const tools = getAgentAiTools(backgroundToolDeps(payload, grant)) as Record<
    string,
    {
      execute?: (input: unknown, options: { toolCallId: string; messages: [] }) => Promise<unknown>;
    }
  >;
  const execute = tools[toolName]?.execute;
  if (!execute) throw new Error(`Agent tool ${toolName} has no executable implementation.`);

  return execute(input, { toolCallId, messages: [] });
}
executeAgentTool.maxRetries = 0;

async function normalizeAgentToolInput(
  payload: AgentTurnWorkflowPayload,
  toolName: string,
  input: unknown,
): Promise<AgentToolInputResult> {
  "use step";
  const { normalizeAgentAiToolInput } = await import("@/ee/agent-chat/agent-tools");
  return runAsBackgroundTenant(payload.userId, () =>
    normalizeAgentAiToolInput(toolName, input, resolveAgentToolResultMaxChars(payload.turnBudget.maxToolResultChars)),
  );
}
normalizeAgentToolInput.maxRetries = 0;

async function publishTranscriptEvents(events: AgentTranscriptEvent[]): Promise<void> {
  "use step";
  if (events.length === 0) return;

  const writer = getWritable<AgentTranscriptEvent>().getWriter();
  try {
    for (const event of events) await writer.write(event);
  } finally {
    writer.releaseLock();
  }
}

async function persistRound(
  payload: AgentTurnWorkflowPayload,
  round: {
    roundIndex: number;
    parts: unknown;
    finishReason: string;
    tokens: TokenCounts;
    reasoningTokens: number;
    costMicrocents: number;
  },
): Promise<{ cancelled: boolean; leaseLost: boolean }> {
  "use step";
  const repo = getAgentChatRepo();

  return runAsBackgroundTenant(payload.userId, async () => {
    const leaseHeld = await repo.heartbeatAgentRunUnscoped({
      turnRequestId: payload.turnRequestId,
      companyId: payload.companyId,
      userId: payload.userId,
      runId: payload.runId,
    });
    await repo.recordAgentRunRoundUnscoped({
      turnRequestId: payload.turnRequestId,
      companyId: payload.companyId,
      runId: payload.runId,
      roundIndex: round.roundIndex,
      parts: round.parts as Prisma.InputJsonValue,
      finishReason: round.finishReason,
      ...round.tokens,
      reasoningTokens: round.reasoningTokens,
      costMicrocents: round.costMicrocents,
      modelSpec: payload.turnBudget.modelSpec,
      servingProvider: payload.turnBudget.servingProvider,
    });

    const cancelled = await repo.isAgentTurnCancellationRequestedUnscoped({
      turnRequestId: payload.turnRequestId,
      companyId: payload.companyId,
    });

    return { cancelled, leaseLost: !leaseHeld };
  });
}

async function openApprovalRequests(
  payload: AgentTurnWorkflowPayload,
  requests: PendingApproval[],
  windowMs: number,
): Promise<void> {
  "use step";
  const repo = getAgentChatRepo();
  const expiresAt = new Date(Date.now() + windowMs);

  await runAsBackgroundTenant(payload.userId, async () => {
    await repo.extendAgentRunLeaseForSuspensionUnscoped({
      companyId: payload.companyId,
      userId: payload.userId,
      runId: payload.runId,
      until: expiresAt,
    });

    for (const request of requests) {
      await repo.createPendingApprovalRequestOrThrowUnscoped({
        conversationId: payload.conversationId,
        requestId: request.requestId,
        toolName: request.toolName,
        companyId: payload.companyId,
        userId: payload.userId,
        expiresAt,
      });
    }
  });
}
openApprovalRequests.maxRetries = 0;

async function publishAssistantText(text: string): Promise<void> {
  "use step";
  const writer = getWritable<{
    type: string;
    payload: Record<string, unknown>;
  }>().getWriter();
  try {
    await writer.write({ type: "delta", payload: { text } });
  } finally {
    writer.releaseLock();
  }
}

async function ensureTurnReservation(
  payload: AgentTurnWorkflowPayload,
  requiredCredits: number,
): Promise<number | null> {
  "use step";
  return runAsBackgroundTenant(payload.userId, () =>
    getAgentChatRepo().extendUsageReservationUnscoped({
      turnRequestId: payload.turnRequestId,
      companyId: payload.companyId,
      userId: payload.userId,
      requiredCredits,
    }),
  );
}

type AgentRunnerMessageKind =
  | "safetyLimit"
  | "creditLimit"
  | "hostedAiUnavailable"
  | "outputLimit"
  | "turnError"
  | "emptyReply";

async function resolveRunnerMessage(locale: string, kind: AgentRunnerMessageKind): Promise<string> {
  "use step";
  const { getTranslator } = await import("@/i18n/get-translator");
  const { appLocaleOrDefault } = await import("@/i18n/locale-registry");
  const t = await getTranslator(appLocaleOrDefault(locale));

  if (kind === "creditLimit") return t("AgentChat.runner.creditLimit");
  if (kind === "hostedAiUnavailable") return t("AgentChat.runner.hostedAiUnavailable");
  if (kind === "outputLimit") return t("AgentChat.runner.outputLimit");
  if (kind === "turnError") return t("AgentChat.runner.turnError");
  if (kind === "emptyReply") return t("AgentChat.runner.emptyReply");

  return t("AgentChat.runner.safetyLimit");
}

async function readCancellation(payload: AgentTurnWorkflowPayload): Promise<boolean> {
  "use step";
  return runAsBackgroundTenant(payload.userId, () =>
    getAgentChatRepo().isAgentTurnCancellationRequestedUnscoped({
      turnRequestId: payload.turnRequestId,
      companyId: payload.companyId,
    }),
  );
}

async function publishUiCommands(
  commands: {
    toolCallId: string;
    name: string;
    input: Record<string, unknown>;
  }[],
): Promise<void> {
  "use step";
  const writer = getWritable<{
    type: string;
    payload: Record<string, unknown>;
  }>().getWriter();
  try {
    for (const command of commands) {
      await writer.write({
        type: "ui_command",
        payload: {
          commandId: command.toolCallId,
          name: command.name,
          input: command.input,
        },
      });
    }
  } finally {
    writer.releaseLock();
  }
}

async function readUiCommandResults(
  payload: AgentTurnWorkflowPayload,
  commands: { toolCallId: string; name: string }[],
): Promise<AgentToolResumeResult[]> {
  "use step";
  const repo = getAgentChatRepo();
  const maxChars = resolveAgentToolResultMaxChars(payload.turnBudget.maxToolResultChars);

  return runAsBackgroundTenant(payload.userId, async () => {
    const resumed: AgentToolResumeResult[] = [];

    for (const command of commands) {
      const outcome = await repo.takeUiCommandResultUnscoped({
        conversationId: payload.conversationId,
        commandId: command.toolCallId,
        companyId: payload.companyId,
        userId: payload.userId,
      });

      resumed.push({
        toolCallId: command.toolCallId,
        toolName: command.name,
        output: outcome
          ? { ok: outcome.ok, result: outcome.result.slice(0, maxChars) }
          : {
              ok: false,
              result: "The interface did not respond, so nothing changed on screen.",
            },
      });
    }

    const writer = getWritable<{
      type: string;
      payload: Record<string, unknown>;
    }>().getWriter();
    try {
      for (const entry of resumed) {
        const status = agentToolOutcomeStatus(entry.output);
        await writer.write({
          type: "activity_result",
          payload: {
            id: entry.toolCallId,
            isError: status.failed,
            status: status.status,
          },
        });
      }
    } finally {
      writer.releaseLock();
    }

    return resumed;
  });
}

async function readApprovalDecisions(
  payload: AgentTurnWorkflowPayload,
  requests: PendingApproval[],
): Promise<AgentApprovalOutcome[]> {
  "use step";
  const repo = getAgentChatRepo();

  return runAsBackgroundTenant(payload.userId, async () => {
    const outcomes: AgentApprovalOutcome[] = [];

    for (const request of requests) {
      const approval = await repo.findApprovalDecisionUnscoped({
        conversationId: payload.conversationId,
        requestId: request.requestId,
        companyId: payload.companyId,
        userId: payload.userId,
      });

      if (approval) {
        outcomes.push({
          toolCallId: request.toolCallId,
          decision: approval.toolName === request.toolName ? approval.decision : "reject",
        });
        continue;
      }

      await repo.discardPendingApprovalRequestUnscoped({
        conversationId: payload.conversationId,
        requestId: request.requestId,
        companyId: payload.companyId,
        userId: payload.userId,
      });
      outcomes.push({ toolCallId: request.toolCallId, decision: "timeout" });
    }

    return outcomes;
  });
}

async function closeTurnStream(): Promise<void> {
  "use step";
  await getWritable().close();
}

async function closeTurnStreamAfterFailure(): Promise<void> {
  "use step";
  try {
    await getWritable().close();
  } catch {
    return;
  }
}
closeTurnStreamAfterFailure.maxRetries = 0;

async function reconcileFailedTurn(payload: AgentTurnWorkflowPayload): Promise<void> {
  "use step";
  await getAgentChatRepo().reconcileInterruptedAgentTurnUnscoped({
    turnRequestId: payload.turnRequestId,
    conversationId: payload.conversationId,
    companyId: payload.companyId,
    userId: payload.userId,
    runId: payload.runId,
  });
}

async function finalizeTurn(
  payload: AgentTurnWorkflowPayload,
  outcome: {
    parts: unknown;
    terminalCode: "completed" | "partial" | "cancelled";
    affectedResources: AgentActivityResource[];
    hasSuccessfulMutation: boolean;
    tokens: TokenCounts;
    ledger: RoundLedgerEntry[];
    reservedCredits: number;
    providerStarted?: boolean;
  },
): Promise<void> {
  "use step";
  const measured = outcome.ledger.every((entry) => entry.measured);
  const unreadableReason = outcome.ledger.find((entry) => entry.unreadableReason)?.unreadableReason ?? null;

  const committed = await runAsBackgroundTenant(payload.userId, () =>
    getAgentChatRepo().finalizeAgentTurnOrThrowUnscoped({
      turnRequestId: payload.turnRequestId,
      conversationId: payload.conversationId,
      companyId: payload.companyId,
      userId: payload.userId,
      runId: payload.runId,
      parts: outcome.parts as Prisma.InputJsonValue,
      terminalCode: outcome.terminalCode,
      affectedResources: outcome.affectedResources,
      usageSettlement:
        outcome.providerStarted === false
          ? null
          : buildAgentUsageSettlement({
              model: payload.turnBudget.modelSpec,
              tokens: outcome.tokens,
              provider: payload.turnBudget.servingProvider,
              reservedCredits: outcome.reservedCredits,
              providerCharge: {
                billed: outcome.ledger.length > 0,
                measuredCostMicrocents:
                  measured && outcome.ledger.length > 0
                    ? outcome.ledger.reduce((total, entry) => total + entry.costMicrocents, 0)
                    : null,
                stepTokens: outcome.ledger.map((entry) => entry.tokens),
                unreadableReason,
              },
            }),
    }),
  );

  const writer = getWritable<AgentTranscriptEvent | AgentTurnTerminalEvent>().getWriter();
  try {
    await writer.write({
      type: "message_committed",
      payload: { messageId: committed.assistantMessage.id },
    });
    await writer.write({
      type: "turn_done",
      payload: {
        isError: isAgentTurnTerminalError(committed.terminalCode),
        terminalCode: committed.terminalCode,
        assistantMessageId: committed.assistantMessage.id,
        affectedResources: committed.affectedResources,
        hasSuccessfulMutation: outcome.hasSuccessfulMutation,
        creditsUsed: committed.chargedCredits,
        numTurns: outcome.ledger.length,
        errorMessage: committed.terminalCode === "policyBreach" ? "policy_breach" : null,
        replayed: false,
      },
    });
  } finally {
    writer.releaseLock();
  }
}
finalizeTurn.maxRetries = 0;

export async function runAgentTurn(payload: AgentTurnWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    const providerStarted = await openTurn(payload);
    if (!providerStarted) {
      const message = await resolveRunnerMessage(payload.locale, "hostedAiUnavailable");
      const transcript = new AgentTurnTranscript(() => undefined);
      transcript.appendText(message);
      await publishAssistantText(message);
      await finalizeTurn(payload, {
        parts: transcript.replyParts,
        terminalCode: "partial",
        affectedResources: [],
        hasSuccessfulMutation: false,
        tokens: emptyTokens(),
        ledger: [],
        reservedCredits: payload.turnBudget.reservedCredits,
        providerStarted: false,
      });
      await closeTurnStream();
      return;
    }
    const shells = await loadAgentToolShells();
    const writable = getWritable();

    const queued: AgentTranscriptEvent[] = [];
    const transcript = new AgentTurnTranscript((event) => {
      if ((AGENT_TRANSCRIPT_FORWARDED_EVENTS as readonly string[]).includes(event.type)) queued.push(event);
    });

    const systemPrompt = buildAgentSystemPrompt({
      userName: payload.userName,
      appBaseUrl: payload.appBaseUrl,
      locale: payload.locale,
    });
    const providerContext = buildAgentProviderContext(systemPrompt, payload.messages, []);

    let tokens = emptyTokens();
    let cancelled = await readCancellation(payload);
    let roundIndex = 0;
    let appliedThisCall = 0;
    let finishReason = "unknown";
    const ledger: RoundLedgerEntry[] = [];
    const grants = new Map<string, ToolApprovalGrant>();
    const resolveToolInput = createAgentToolInputResolver((toolName, input) =>
      normalizeAgentToolInput(payload, toolName, input),
    );
    const completedTools: ({ toolCallId: string; toolName: string } & ({ output: unknown } | { threw: true }))[] = [];

    const continuationSteps: AgentContinuationStep[] = [];
    let deferredRound: {
      step: AgentRoundResult;
      outcomes: AgentToolOutcome[];
    } | null = null;
    const continuationLimits = agentContinuationLimits(Number.MAX_SAFE_INTEGER);
    let safetyStop: string | null = null;
    let budgetStop = false;
    let hostedAiStop = false;
    const hostedAiPaused = new Error("Hosted AI provider work is paused.");
    let abandoned = false;
    let reservedCredits = payload.turnBudget.reservedCredits;
    let roundFailure: WorkflowFailure | null = null;
    const settledToolCallIds = new Set<string>();

    const recordContinuationRound = (step: AgentRoundResult, outcomes: AgentToolOutcome[]) => {
      continuationSteps.push(toAgentContinuationStep(step, outcomes));
      const loop = decideAgentContinuationLoop(
        { startedAtMs: 0, steps: continuationSteps, observedAtMs: 0 },
        continuationLimits,
      );
      if (loop.action === "error" && loop.reason !== "step_limit") safetyStop = loop.reason;
    };

    const resolveDeferredRound = (resumed: readonly AgentToolOutcome[]) => {
      if (!deferredRound) return;
      const pending = deferredRound;
      deferredRound = null;
      recordContinuationRound(pending.step, [...pending.outcomes, ...resumed]);
    };

    const appendDeferredOutcomes = (outcomes: readonly AgentToolOutcome[]) => {
      if (deferredRound) deferredRound.outcomes.push(...outcomes);
    };

    const settleToolOutcome = (toolCallId: string, toolName: string | undefined, output: unknown) => {
      if (settledToolCallIds.has(toolCallId)) return;
      settledToolCallIds.add(toolCallId);

      const outcome = agentToolOutcomeStatus(output);
      transcript.completeToolCall({
        toolCallId,
        toolName,
        status: outcome.status,
        failed: outcome.failed,
      });
    };

    const applyRound = async (step: AgentRoundResult) => {
      appliedThisCall += 1;

      try {
        for (const raw of step.content) {
          const part = raw as {
            type?: string;
            text?: string;
            toolCallId?: string;
            toolName?: string;
            input?: unknown;
          };
          if (part.type === "text" && part.text) transcript.pushTextDelta(part.text);
          else if (part.type === "tool-call" && part.toolCallId && part.toolName) {
            transcript.beginToolCall({
              toolCallId: part.toolCallId,
              toolName: part.toolName,
              activity: describeAgentTool(internalToolIdentity(part.toolName), part.input),
            });
          }
        }
        transcript.finishTextSegment();

        const outcomes: AgentToolOutcome[] = completedTools.splice(0);
        for (const completed of outcomes) {
          if ("threw" in completed) {
            settledToolCallIds.add(completed.toolCallId);
            transcript.failToolCall(completed.toolCallId);
            continue;
          }

          settleToolOutcome(completed.toolCallId, completed.toolName, completed.output);
        }

        const roundTokens = usageToTokenCounts(step.usage);
        const charge = readAgentProviderCharge(step.providerMetadata, payload.turnBudget.servingProvider);
        const costMicrocents =
          charge.outcome === "measured"
            ? charge.charge.costMicrocents
            : computeCostMicrocents(payload.turnBudget.modelSpec, roundTokens, payload.turnBudget.servingProvider);

        tokens = addTokens(tokens, roundTokens);
        ledger.push({
          tokens: roundTokens,
          costMicrocents,
          measured: charge.outcome === "measured",
          unreadableReason: charge.outcome === "unreadable" ? charge.reason : undefined,
        });

        const roundOutcome = await persistRound(payload, {
          roundIndex: roundIndex++,
          parts: step.content,
          finishReason: step.finishReason,
          tokens: roundTokens,
          reasoningTokens: step.usage.outputTokenDetails?.reasoningTokens ?? 0,
          costMicrocents,
        });
        cancelled ||= roundOutcome.cancelled;
        abandoned ||= roundOutcome.leaseLost;
        await publishTranscriptEvents(queued.splice(0));

        const accruedMicrocents = ledger.reduce((total, entry) => total + entry.costMicrocents, 0);
        const requiredCredits =
          agentCreditsForStartedProviderCost(accruedMicrocents) + payload.turnBudget.roundReserveCredits;
        if (requiredCredits > reservedCredits) {
          const extended = await ensureTurnReservation(payload, requiredCredits);
          if (extended === null) budgetStop = true;
          else reservedCredits = extended;
        }

        const settledIds = new Set(outcomes.map((outcome) => outcome.toolCallId));
        const hasPausedCall = step.content.some((raw) => {
          const part = raw as { type?: string; toolCallId?: string };
          return part.type === "tool-call" && Boolean(part.toolCallId) && !settledIds.has(part.toolCallId as string);
        });

        if (hasPausedCall) {
          deferredRound = { step, outcomes };
          return;
        }

        recordContinuationRound(step, outcomes);
      } catch (error) {
        roundFailure ??= toWorkflowFailure(error);
      }
    };

    let messages = providerContext.messages;
    let instructions = systemPrompt;

    while (!abandoned && !cancelled && !budgetStop && !hostedAiStop && safetyStop === null && roundFailure === null) {
      const agent = new WorkflowAgent({
        id: WORKFLOW_NAME,
        model: payload.turnBudget.modelSpec,
        instructions,
        tools: Object.fromEntries(
          shells.map((shell) => [
            shell.name,
            {
              description: shell.description,
              inputSchema: jsonSchema(shell.inputSchema as never),
              needsApproval: async (input: unknown, options: { toolCallId: string }) => {
                const prepared = await resolveToolInput(shell.name, options.toolCallId, input);
                return (
                  prepared.ok &&
                  shell.gated &&
                  requiresApproval(internalToolIdentity(shell.name), { annotations: shell.annotations }, prepared.input)
                );
              },
              ...(isAgentPanelTool(shell.name)
                ? {}
                : {
                    execute: async (input: unknown, options: { toolCallId: string }) => {
                      const prepared = await resolveToolInput(shell.name, options.toolCallId, input);
                      if (!prepared.ok) return prepared;
                      return executeAgentTool(
                        payload,
                        shell.name,
                        options.toolCallId,
                        prepared.input,
                        grants.get(options.toolCallId) ?? "not-required",
                      );
                    },
                  }),
            },
          ]),
        ),
        maxOutputTokens: payload.turnBudget.maxOutputTokens,
        providerOptions: {
          gateway: {
            only: [payload.turnBudget.servingProvider],
            zeroDataRetention: true,
            disallowPromptTraining: true,
          },
          openai: { parallelToolCalls: false },
        },
        prepareStep: async () => {
          if (!(await canStartNextHostedAiProviderRound(payload))) throw hostedAiPaused;
          return {};
        },
        stopWhen: [
          isStepCount(AGENT_SEGMENT_ROUNDS),
          () => abandoned || cancelled || budgetStop || hostedAiStop || safetyStop !== null || roundFailure !== null,
        ],
        onToolExecutionEnd: (event) => {
          completedTools.push(
            event.success
              ? {
                  toolCallId: event.toolCall.toolCallId,
                  toolName: event.toolCall.toolName,
                  output: event.output,
                }
              : {
                  toolCallId: event.toolCall.toolCallId,
                  toolName: event.toolCall.toolName,
                  threw: true,
                },
          );
        },
        onStepEnd: (step) => applyRound(step as unknown as AgentRoundResult),
      });

      appliedThisCall = 0;
      let result;
      try {
        result = await agent.stream({ messages, writable, preventClose: true, sendFinish: false });
      } catch (error) {
        if (error === hostedAiPaused) {
          hostedAiStop = true;
          break;
        }
        throw error;
      }
      finishReason = result.finishReason;

      for (const step of (result.steps as unknown as AgentRoundResult[]).slice(appliedThisCall)) await applyRound(step);

      for (const message of result.messages) {
        if (message.role !== "tool" || typeof message.content === "string") continue;
        for (const part of message.content) {
          if (part.type !== "tool-result") continue;
          const output = part.output as { value?: unknown } | undefined;
          settleToolOutcome(part.toolCallId, part.toolName, output && "value" in output ? output.value : output);
        }
      }

      if (abandoned) break;

      let pending = pendingApprovalCalls(result.messages);
      if (pending.length === 0) {
        if (finishReason === "stop") break;
        if (cancelled || budgetStop || safetyStop !== null || roundFailure !== null) break;

        const carried = result.messages.filter((message) => message.role !== "system");
        const fitsWhole = isAgentStepContextWithinBudget(
          { ...providerContext, system: instructions },
          carried,
          payload.turnBudget.maxContextBytes,
        );
        if (fitsWhole) {
          messages = carried;
          continue;
        }

        const compacted = compactAgentContinuationContext({
          system: systemPrompt,
          initialMessages: providerContext.messages,
          steps: continuationSteps,
        });
        instructions = compacted.system;
        messages = [...compacted.messages];
        continue;
      }

      const preparedPending = await Promise.all(
        pending.map(async (call) => ({
          call,
          prepared: await resolveToolInput(call.toolName, call.toolCallId, call.input),
        })),
      );
      const invalidResults = preparedPending.flatMap(({ call, prepared }) =>
        prepared.ok ? [] : [{ toolCallId: call.toolCallId, toolName: call.toolName, output: prepared }],
      );
      let resumableMessages = withToolResults(result.messages, invalidResults);
      for (const outcome of invalidResults) settleToolOutcome(outcome.toolCallId, outcome.toolName, outcome.output);
      appendDeferredOutcomes(invalidResults);
      pending = preparedPending.flatMap(({ call, prepared }) =>
        prepared.ok ? [{ ...call, input: prepared.input }] : [],
      );
      if (pending.length === 0) {
        resolveDeferredRound([]);
        await publishTranscriptEvents(queued.splice(0));
        messages = resumableMessages;
        continue;
      }

      const panelCalls = pending.filter((call) => isAgentPanelTool(call.toolName));
      if (panelCalls.length > 0) {
        const commands = panelCalls.map((call) => ({
          toolCallId: call.toolCallId,
          name: call.toolName,
          input: toAgentUiCommandInput(call.toolName, call.input) ?? {},
        }));
        const uiHook = createHook<{ commandId: string }>({
          token: agentUiCommandHookToken(payload.conversationId),
        });
        await publishUiCommands(commands);
        await Promise.race([
          (async () => {
            await uiHook;
          })(),
          sleep(AGENT_UI_COMMAND_WINDOW_MS),
        ]);
        uiHook.dispose();

        cancelled = await readCancellation(payload);
        const resumed = await readUiCommandResults(payload, commands);
        for (const outcome of resumed) settleToolOutcome(outcome.toolCallId, outcome.toolName, outcome.output);
        await publishTranscriptEvents(queued.splice(0));

        resumableMessages = withToolResults(resumableMessages, resumed);
        if (cancelled) {
          resolveDeferredRound(resumed.map((entry) => ({ ...entry })));
          break;
        }
        pending = pending.filter((call) => !isAgentPanelTool(call.toolName));
        if (pending.length === 0) {
          resolveDeferredRound(resumed.map((entry) => ({ ...entry })));
          messages = resumableMessages;
          continue;
        }
        appendDeferredOutcomes(resumed);
      }

      const requests: PendingApproval[] = pending.map((call) => ({
        requestId: agentApprovalRequestId(payload.turnRequestId, call.toolCallId),
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
      }));

      const hook = createHook<AgentApprovalWake>({
        token: agentApprovalHookToken(payload.conversationId),
      });
      await openApprovalRequests(payload, requests, AGENT_APPROVAL_WINDOW_MS);
      for (const request of requests) {
        transcript.beginApproval(
          request.requestId,
          describeAgentTool(internalToolIdentity(request.toolName), request.input),
        );
      }
      await publishTranscriptEvents(queued.splice(0));

      const requestIds = new Set(requests.map((request) => request.requestId));
      await Promise.race([
        (async () => {
          for await (const wake of hook) if (isRelevantAgentApprovalWake(wake, requestIds)) return;
        })(),
        sleep(AGENT_APPROVAL_WINDOW_MS),
      ]);
      hook.dispose();

      cancelled = await readCancellation(payload);
      const outcomes = await readApprovalDecisions(payload, requests);
      for (const outcome of outcomes) {
        const request = requests.find((candidate) => candidate.toolCallId === outcome.toolCallId);
        if (!request) continue;
        grants.set(outcome.toolCallId, outcome.decision === "approve" ? "approve" : "not-required");
        transcript.resolveApproval(
          request.requestId,
          outcome.decision === "approve"
            ? "approved"
            : outcome.decision === "reject"
              ? "rejected"
              : cancelled
                ? "cancelled"
                : "timeout",
          outcome.decision,
        );
        if (outcome.decision !== "approve") {
          settledToolCallIds.add(outcome.toolCallId);
          transcript.completeToolCall({
            toolCallId: outcome.toolCallId,
            status: "cancelled",
            failed: false,
          });
        }
      }
      await publishTranscriptEvents(queued.splice(0));

      resolveDeferredRound(
        outcomes.map((outcome) => ({
          toolCallId: outcome.toolCallId,
          toolName: requests.find((request) => request.toolCallId === outcome.toolCallId)?.toolName ?? "",
          output: {
            ok: outcome.decision === "approve",
            result: `Approval ${outcome.decision}.`,
          },
        })),
      );
      messages = withApprovalResponses(resumableMessages, outcomes);
    }

    if (abandoned) {
      await closeTurnStream();
      return;
    }

    transcript.finishTextSegment();
    if (roundFailure) await reportFailure(WORKFLOW_NAME, roundFailure, payload.tenant);

    const stopKind: AgentRunnerMessageKind | null = hostedAiStop
      ? "hostedAiUnavailable"
      : budgetStop
        ? "creditLimit"
        : roundFailure
          ? "turnError"
          : safetyStop
            ? "safetyLimit"
            : finishReason === "length"
              ? "outputLimit"
              : null;
    if (stopKind) {
      const message = await resolveRunnerMessage(payload.locale, stopKind);
      const trailing = transcript.replyText.trim() ? `\n\n${message}` : message;
      transcript.appendText(trailing);
      await publishAssistantText(trailing);
    }
    transcript.failUnfinishedTools(cancelled ? "cancelled" : "error", true);
    if (transcript.replyParts.length === 0) {
      const message = await resolveRunnerMessage(payload.locale, "emptyReply");
      transcript.appendText(message);
      await publishAssistantText(message);
    }
    await publishTranscriptEvents(queued.splice(0));

    await finalizeTurn(payload, {
      parts: transcript.replyParts,
      terminalCode: cancelled
        ? "cancelled"
        : hostedAiStop || safetyStop || roundFailure || finishReason !== "stop"
          ? "partial"
          : "completed",
      affectedResources: transcript.affectedResources,
      hasSuccessfulMutation: transcript.hasSuccessfulMutation,
      tokens,
      ledger,
      reservedCredits,
    });
    await closeTurnStream();
  } catch (error) {
    const failures = [error];
    try {
      await reconcileFailedTurn(payload);
    } catch (cleanupError) {
      failures.push(cleanupError);
    }
    try {
      await closeTurnStreamAfterFailure();
    } catch (closeError) {
      failures.push(closeError);
    }
    for (const failure of failures) {
      try {
        await reportFailure(WORKFLOW_NAME, toWorkflowFailure(failure), payload.tenant);
      } catch {}
    }
    throw error;
  }
}
