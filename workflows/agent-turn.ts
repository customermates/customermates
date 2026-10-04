import type { Prisma } from "@/generated/prisma";
import type { AgentToolDeps } from "@/ee/agent-chat/agent-tools";
import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { AgentActivityResource } from "@/ee/agent-chat/agent-activity";
import type { AgentTranscriptEvent } from "@/ee/agent-chat/agent-turn-transcript";
import type { AgentTurnTerminalEvent } from "@/ee/agent-chat/agent-durable-stream";
import type { ReplayMessage } from "@/ee/agent-chat/agent-stream-utils";
import type { TokenCounts } from "@/ee/agent-chat/model-pricing";
import type { WorkflowTenant } from "./workflow-tenant";
import type { ClassifierCharge } from "@/ee/agent-chat/classifier/metered";
import type { RetrievalTiming } from "@/core/retrieval/retrieval-context";
import type { ModelMessage } from "ai";

import { WorkflowAgent } from "@ai-sdk/workflow";
import { createHook, getWritable, sleep } from "workflow";
import { isStepCount, jsonSchema } from "ai";

import { AgentTurnTranscript } from "@/ee/agent-chat/agent-turn-transcript";
import { approvalWindowMsForSurface, isUnattendedSurface } from "@/ee/agent-chat/agent-surface-policy";
import { isAgentTurnTerminalError, type AgentTurnStopReason } from "@/ee/agent-chat/agent-turn-request";
import {
  agentApprovalHookToken,
  agentApprovalRequestId,
  isRelevantAgentApprovalWake,
  pendingApprovalCalls,
  toolApprovalDecisionForGrant,
  approvalDeclineResult,
  withApprovalResponses,
  withToolResults,
  type AgentApprovalOutcome,
  type AgentApprovalWake,
  type AgentToolResumeResult,
  type ToolApprovalGrant,
} from "@/ee/agent-chat/agent-approval-resume";
import { agentUiCommandHookToken, isAgentPanelTool, toAgentUiCommandInput } from "@/ee/agent-chat/agent-ui-command";
import { activeAgentToolNames } from "@/ee/agent-chat/agent-toolset-routing";
import { googleThinkingProviderOptions } from "@/ee/agent-chat/agent-thinking-options";
import { buildAgentProviderContext } from "@/ee/agent-chat/agent-provider-context";
import { agentSystemPromptParts, routineTriggerEventOf } from "@/ee/agent-chat/system-prompt";
import type { AgentAiToolDefinition, AgentToolOptions } from "@/ee/agent-chat/agent-tools";
import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import {
  agentBatchContainsWebCall,
  agentWebPageCallLimit,
  agentWebSourcesFooter,
  collectAgentWebSources,
  isAgentWebTool,
  isSuccessfulAgentWebResult,
} from "@/ee/agent-chat/agent-web-policy";
import { userWebsiteHomepage } from "@/ee/agent-chat/user-website-homepages";
import { buildAgentUsageSettlement, usageToTokenCounts } from "@/ee/agent-chat/agent-usage-settlement";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";
import { createAgentSupportTicket } from "@/ee/agent-chat/agent-support-ticket";
import { describeAgentTool } from "@/ee/agent-chat/agent-activity";
import {
  agentToolOutcomeStatus,
  unwrapToolOutput,
  AGENT_TRANSCRIPT_FORWARDED_EVENTS,
} from "@/ee/agent-chat/agent-durable-stream";
import { toAgentContinuationStep, type AgentToolOutcome } from "@/ee/agent-chat/agent-run-limits";
import {
  AGENT_CONTINUATION_RETAINED_RESPONSE_STEPS,
  compactAgentContinuationContext,
  decideAgentContinuationLoop,
  type AgentContinuationStep,
} from "@/ee/agent-chat/agent-continuation";
import { isAgentStepContextWithinBudget } from "@/ee/agent-chat/agent-provider-context";
import { benchmarkToolOutputPart } from "@/ee/agent-chat/benchmark-tool-output";
import { agentAuxiliaryCharge, buildAgentTurnClassifierTrace } from "@/ee/agent-chat/agent-classifier-trace";
import { getAgentChatRepo, getBackgroundTaskService } from "@/core/di";
import { internalToolIdentity, WIKI_WEBSITE_IMPORT_TOOL_NAME } from "@/ee/agent-chat/tool-identity";
import type { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { readAgentServedCharge, readGatewayCostMicrocents } from "@/ee/agent-chat/gateway-cost";
import {
  readAgentProviderErrorCharge,
  readAgentProviderRateLimit,
  readAgentProviderRoundCharge,
} from "@/ee/agent-chat/agent-provider-error";
import { isReadOnlyAgentToolCall, requiresApproval } from "@/ee/agent-chat/gated-tools";
import { isAgentToolCancellation } from "@/ee/agent-chat/agent-tool-cancellation";
import { createAgentToolInputResolver, type AgentToolInputResult } from "@/ee/agent-chat/agent-tool-input";
import { resolveAgentApprovalContext } from "@/ee/agent-chat/agent-external-approval-context";
import {
  agentFundedRetryCount,
  isAgentContextWithinBudget,
  resolveAgentToolResultMaxChars,
} from "@/ee/agent-chat/agent-budget-policy";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { runInRoutineContext } from "@/core/decorators/routine-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";

import { reportFailure, reportWarning, toWorkflowFailure, type WorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "agent-turn";

export const AGENT_UI_COMMAND_WINDOW_MS = 30 * 1000;
export const AGENT_SEGMENT_ROUNDS = 32;
const AGENT_MODEL_DEFAULT_MAX_RETRIES = 2;

const AGENT_OUTPUT_CONTINUATION_PROMPT =
  "<agent_output_continuation>Continue directly from the partial assistant response above. Do not repeat completed text. Finish the user's request.</agent_output_continuation>";
const AGENT_CONTEXT_COMPACTION_REQUIRED = new Error(
  "Agent context requires compaction before the next provider round.",
);
const AGENT_LOCAL_TERMINATION_REQUIRED = new Error(
  "Agent execution reached a local terminal condition before the next provider round.",
);
const AI_API_CALL_ERROR_MARKER = Symbol.for("vercel.ai.error.AI_APICallError");
const AI_GATEWAY_ERROR_MARKER = Symbol.for("vercel.ai.gateway.error");
const AI_RETRY_ERROR_MARKER = Symbol.for("vercel.ai.error.AI_RetryError");

export type AgentTurnWorkflowPayload = {
  turnRequestId: string;
  conversationId: string;
  runId: string;
  companyId: string;
  userId: string;
  userName: string;
  locale: string;
  appBaseUrl: string;
  pageRoute: string | null;
  messages: ReplayMessage[];
  turnBudget: AgentTurnBudget;
  schemaDigest?: string | null;
  tenant: WorkflowTenant;
  surface?: AgentTurnSurface;
  toolsets?: string[];
  recordToolOutputs?: boolean;
  wikiWebsiteSetup?: { userHomepages: string[] };
  wikiCatalog?: string | null;
};

export type AgentTurnSurface = "chat" | "routine";

type AgentToolShell = AgentAiToolDefinition & {
  annotations: Record<string, boolean> | undefined;
  gated: boolean;
  toolset: string | null;
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
  tokenPriced?: boolean;
};

type AgentTurnUsageOutcome = {
  tokens: TokenCounts;
  ledger: RoundLedgerEntry[];
  reservedMicrocents: number;
  providerStarted?: boolean;
  unreportedProviderRounds?: number;
  auxiliaryCharges?: ClassifierCharge[];
  retrievalTimings?: RetrievalTiming[];
};

type AgentTurnFinalizationOutcome = AgentTurnUsageOutcome & {
  parts: unknown;
  terminalCode: "completed" | "partial" | "cancelled";
  stopReason: AgentTurnStopReason | null;
  affectedResources: AgentActivityResource[];
  hasSuccessfulMutation: boolean;
};

function nextAgentSegmentMessages(args: {
  messages: readonly ModelMessage[];
  finishReason: string;
  lastStep: AgentContinuationStep | undefined;
}): ModelMessage[] {
  const messages = args.messages.filter((message) => message.role !== "system");
  if (args.finishReason !== "length") return messages;

  return [
    ...messages,
    ...(args.lastStep?.response.messages ?? []),
    { role: "user", content: AGENT_OUTPUT_CONTINUATION_PROMPT },
  ];
}

function hasErrorMarker(error: unknown, marker: symbol) {
  return typeof error === "object" && error !== null && marker in error && error[marker as keyof typeof error] === true;
}

function isAgentProviderFailure(error: unknown): boolean {
  const seen = new Set<unknown>();
  let current = error;
  for (let depth = 0; depth < 32; depth += 1) {
    if (typeof current !== "object" || current === null || seen.has(current)) return false;
    seen.add(current);
    if (
      hasErrorMarker(current, AI_API_CALL_ERROR_MARKER) ||
      hasErrorMarker(current, AI_GATEWAY_ERROR_MARKER) ||
      hasErrorMarker(current, AI_RETRY_ERROR_MARKER)
    )
      return true;
    if (!("cause" in current)) return false;
    current = current.cause;
  }
  return false;
}

function usageSettlementForTurn(payload: AgentTurnWorkflowPayload, outcome: AgentTurnUsageOutcome) {
  if (outcome.providerStarted === false) return null;

  const unreportedProviderRounds = outcome.unreportedProviderRounds ?? 0;
  const auxiliary = agentAuxiliaryCharge(outcome.auxiliaryCharges ?? []);
  const measured = unreportedProviderRounds === 0 && outcome.ledger.every((entry) => entry.measured);
  const totalCostMicrocents = outcome.ledger.reduce((total, entry) => total + entry.costMicrocents, 0);
  const unreportedCostMicrocents =
    unreportedProviderRounds > 0
      ? Math.max(0, outcome.reservedMicrocents - totalCostMicrocents - auxiliary.costMicrocents)
      : 0;
  const unreadableReason =
    outcome.ledger.find((entry) => entry.unreadableReason)?.unreadableReason ??
    (unreportedProviderRounds > 0 ? "an attempted provider round reported no usage evidence" : null);
  const anomalousRounds = outcome.ledger.filter((entry) => !entry.measured && !entry.tokenPriced).length;
  if (anomalousRounds > 0 || unreportedProviderRounds > 0) {
    void reportWarning(
      WORKFLOW_NAME,
      `Agent usage settled from modelled cost because the provider charge was unreadable (${unreadableReason ?? "no reason"}) for ${anomalousRounds + unreportedProviderRounds} of ${outcome.ledger.length + unreportedProviderRounds} rounds on ${payload.turnBudget.modelSpec}.`,
      payload.tenant,
    );
  }
  return buildAgentUsageSettlement({
    model: payload.turnBudget.modelSpec,
    tokens: outcome.tokens,
    provider: payload.turnBudget.servingProvider,
    inferenceRegion: payload.turnBudget.inferenceRegion,
    reservedMicrocents: outcome.reservedMicrocents,
    auxiliary,
    providerCharge: {
      billed: outcome.ledger.length > 0 || unreportedProviderRounds > 0,
      measuredCostMicrocents: measured && outcome.ledger.length > 0 ? totalCostMicrocents : null,
      estimatedCostMicrocents: measured ? undefined : totalCostMicrocents + unreportedCostMicrocents,
      stepTokens: outcome.ledger.map((entry) => entry.tokens),
      unreadableReason,
    },
  });
}

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
    pageRoute: payload.pageRoute,
    latestUserMessage: payload.messages.findLast((message) => message.role === "user")?.text ?? null,
    runInCallerContext: (run) =>
      runAsBackgroundTenant(payload.userId, () => {
        if (getTenantUser().companyId !== payload.companyId)
          throw new Error("Agent tenant changed during tool execution.");
        return runInRoutineContext(payload.surface === "routine" ? { causationDepth: 1 } : null, run);
      }),
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
  return runAsBackgroundTenant(payload.userId, () => {
    if (getTenantUser().companyId !== payload.companyId) return false;
    return getAgentChatRepo().markAgentTurnProviderStartedUnscoped({
      turnRequestId: payload.turnRequestId,
      conversationId: payload.conversationId,
      companyId: payload.companyId,
      userId: payload.userId,
      runId: payload.runId,
    });
  });
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

async function loadAgentToolShells(
  surface: AgentTurnSurface,
  servingProvider: string,
  options: AgentToolOptions,
): Promise<AgentToolShell[]> {
  "use step";
  const { AGENT_HOSTED_TOOL_ANNOTATIONS, agentToolDefinitionsForTurn } = await import("@/ee/agent-chat/agent-tools");
  const { ALL_MCP_TOOLS } = await import("@/features/mcp-tools/tool-registry");
  const gatedByName = new Map(ALL_MCP_TOOLS.map((mcp) => [mcp.name, mcp.annotations]));

  return agentToolDefinitionsForTurn({
    surface,
    servingProvider,
    ...options,
  }).map((definition) => ({
    ...definition,
    annotations: gatedByName.get(definition.name) ?? AGENT_HOSTED_TOOL_ANNOTATIONS[definition.name],
    gated: gatedByName.has(definition.name),
  }));
}

async function executeAgentTool(
  payload: AgentTurnWorkflowPayload,
  toolName: string,
  toolCallId: string,
  input: unknown,
  grant: ToolApprovalGrant,
): Promise<{
  output: unknown;
  classifierCharges: ClassifierCharge[];
  retrievalTimings: RetrievalTiming[];
}> {
  "use step";
  const { getAgentAiTools } = await import("@/ee/agent-chat/agent-tools");
  const { collectClassifierCharges } = await import("@/ee/agent-chat/classifier/metered");
  const { collectRetrievalTimings } = await import("@/core/retrieval/retrieval-context");
  const tools = getAgentAiTools(backgroundToolDeps(payload, grant), {
    locale: payload.locale,
    wikiWebsiteSetup: Boolean(payload.wikiWebsiteSetup),
    surface: payload.surface ?? "chat",
  }) as Record<
    string,
    {
      execute?: (input: unknown, options: { toolCallId: string; messages: [] }) => Promise<unknown>;
    }
  >;
  const execute = tools[toolName]?.execute;
  if (!execute) throw new Error(`Agent tool ${toolName} has no executable implementation.`);

  const run = async () => {
    const {
      value: { value, charges },
      timings,
    } = await collectRetrievalTimings(() =>
      collectClassifierCharges(() => execute(input, { toolCallId, messages: [] })),
    );
    return { output: value, classifierCharges: charges, retrievalTimings: timings };
  };
  return run();
}
executeAgentTool.maxRetries = 0;

async function authorizedWikiSetup(payload: AgentTurnWorkflowPayload): Promise<boolean> {
  "use step";
  if (!payload.wikiWebsiteSetup || (payload.surface ?? "chat") !== "chat") return false;
  const { getGetWikiPagesInteractor, getUserService } = await import("@/core/di");
  const { AppErrorCode, appErrorDetails } = await import("@/core/errors/app-errors");
  const { getTenantUser } = await import("@/core/decorators/tenant-context");
  const { Action, Resource } = await import("@/generated/prisma");
  const { env } = await import("@/env");
  if (env.APP_MODE === "demo") return false;
  return runAsBackgroundTenant(payload.userId, async () => {
    try {
      if (getTenantUser().companyId !== payload.companyId) return false;
      if (!(await getUserService().hasPermission(Resource.wiki, Action.create))) return false;
      const result = await getGetWikiPagesInteractor().invoke({ page: 1, pageSize: 5 });
      if (result.ok && result.data.total === 0) return true;
      const { getWikiWebsiteCrawlRepo } = await import("@/core/di");
      return ((await getWikiWebsiteCrawlRepo().findLatestCrawl())?.pendingHosts.length ?? 0) > 0;
    } catch (error) {
      if (appErrorDetails(error)?.code === AppErrorCode.permissionDenied) return false;
      throw error;
    }
  });
}
authorizedWikiSetup.maxRetries = 0;

async function authorizedWikiCatalog(payload: AgentTurnWorkflowPayload): Promise<string | null> {
  "use step";
  if (!payload.wikiCatalog) return null;
  const { getGetWikiPagesInteractor } = await import("@/core/di");
  const { AppErrorCode, appErrorDetails } = await import("@/core/errors/app-errors");
  const { getTenantUser } = await import("@/core/decorators/tenant-context");
  return runAsBackgroundTenant(payload.userId, async () => {
    try {
      if (getTenantUser().companyId !== payload.companyId) return null;
      const result = await getGetWikiPagesInteractor().invoke({ page: 1, pageSize: 5 });
      if (!result.ok) throw new Error("Knowledge Base catalog could not be authorized.");
      return payload.wikiCatalog ?? null;
    } catch (error) {
      if (appErrorDetails(error)?.code === AppErrorCode.permissionDenied) return null;
      throw error;
    }
  });
}
authorizedWikiCatalog.maxRetries = 0;

async function normalizeAgentToolInput(
  payload: AgentTurnWorkflowPayload,
  toolName: string,
  input: unknown,
): Promise<AgentToolInputResult> {
  "use step";
  const { normalizeAgentAiToolInput } = await import("@/ee/agent-chat/agent-tools");
  return runAsBackgroundTenant(payload.userId, () => {
    if (getTenantUser().companyId !== payload.companyId)
      throw new Error("Agent tenant changed during tool normalization.");
    return normalizeAgentAiToolInput(
      toolName,
      input,
      resolveAgentToolResultMaxChars(payload.turnBudget.maxToolResultChars),
      {
        locale: payload.locale,
        pageRoute: payload.pageRoute,
        wikiWebsiteSetup: Boolean(payload.wikiWebsiteSetup),
        surface: payload.surface ?? "chat",
      },
    );
  });
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

async function ensureTurnReservation(payload: AgentTurnWorkflowPayload, requiredMicrocents: number) {
  "use step";
  return runAsBackgroundTenant(payload.userId, () =>
    getAgentChatRepo().extendUsageReservationUnscoped({
      turnRequestId: payload.turnRequestId,
      companyId: payload.companyId,
      userId: payload.userId,
      requiredMicrocents,
    }),
  );
}

function isSuccessfulToolOutcome(outcome: unknown): boolean {
  if (typeof outcome !== "object" || outcome === null) return false;
  const record = outcome as Record<string, unknown>;
  if (record.ok === false) return false;
  return !isAgentToolCancellation(outcome);
}

type AgentRunnerMessageKind =
  | "cancelled"
  | "providerError"
  | "contentFilter"
  | "creditLimit"
  | "creditLimitNoWrite"
  | "hostedAiUnavailable"
  | "policyBreach"
  | "turnError"
  | "emptyReply"
  | "sourcesHeading";

async function resolveRunnerMessage(locale: string, kind: AgentRunnerMessageKind): Promise<string> {
  "use step";
  const { getTranslator } = await import("@/i18n/get-translator");
  const { appLocaleOrDefault } = await import("@/i18n/locale-registry");
  const t = await getTranslator(appLocaleOrDefault(locale));

  if (kind === "creditLimit") return t("AgentChat.runner.creditLimit");
  if (kind === "creditLimitNoWrite") return t("AgentChat.runner.creditLimitNoWrite");
  if (kind === "hostedAiUnavailable") return t("AgentChat.runner.hostedAiUnavailable");
  if (kind === "turnError") return t("AgentChat.runner.turnError");
  if (kind === "providerError") return t("AgentChat.runner.providerError");
  if (kind === "contentFilter") return t("AgentChat.runner.contentFilter");
  if (kind === "policyBreach") return t("AgentChat.runner.policyBreach");
  if (kind === "cancelled") return t("AgentChat.runner.cancelled");
  if (kind === "emptyReply") return t("AgentChat.runner.emptyReply");
  if (kind === "sourcesHeading") return t("AgentChat.runner.sourcesHeading");

  return kind satisfies never;
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

export const AGENT_RESOLVED_PROVIDER_ERROR_RETRIES = 2;
export const AGENT_RATE_LIMIT_RETRIES = 2;
const AGENT_RATE_LIMIT_BACKOFF_MS = 2_000;
export const AGENT_RATE_LIMIT_MAX_WAIT_MS = 10_000;

export function agentRateLimitRetryDelayMs(retry: number, retryAfterMs: number | null): number {
  return Math.min(AGENT_RATE_LIMIT_MAX_WAIT_MS, retryAfterMs ?? AGENT_RATE_LIMIT_BACKOFF_MS * 2 ** (retry - 1));
}

async function reportResolvedProviderError(
  payload: AgentTurnWorkflowPayload,
  finishReason: string,
  error: unknown,
  attempt: number,
): Promise<void> {
  await reportFailure(
    WORKFLOW_NAME,
    toWorkflowFailure(
      new Error(
        `The provider resolved a round with finishReason "${finishReason}" (attempt ${attempt} of ${AGENT_RESOLVED_PROVIDER_ERROR_RETRIES + 1}): ${safeProviderErrorText(error)}`,
      ),
    ),
    { companyId: payload.companyId, userId: payload.userId },
  );
}

function safeProviderErrorText(error: unknown): string {
  if (error === undefined || error === null) return "the provider reported no error object";
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error).slice(0, 500);
  } catch {
    return "an error object that could not be serialized";
  }
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

async function publishStreamCheckpoint(): Promise<void> {
  "use step";
  const writer = getWritable<{
    type: "stream_checkpoint";
    payload: Record<string, never>;
  }>().getWriter();
  try {
    await writer.write({ type: "stream_checkpoint", payload: {} });
  } finally {
    writer.releaseLock();
  }
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

async function settleRoutineRunStep(ownerUserId: string): Promise<void> {
  "use step";
  await getBackgroundTaskService().dispatch("reconcile-routine-runs", {
    ownerUserId,
  });
}
settleRoutineRunStep.maxRetries = 0;

async function finalizeTurn(payload: AgentTurnWorkflowPayload, outcome: AgentTurnFinalizationOutcome): Promise<void> {
  "use step";

  const committed = await runAsBackgroundTenant(payload.userId, () =>
    getAgentChatRepo().finalizeAgentTurnOrThrowUnscoped({
      turnRequestId: payload.turnRequestId,
      conversationId: payload.conversationId,
      companyId: payload.companyId,
      userId: payload.userId,
      runId: payload.runId,
      parts: outcome.parts as Prisma.InputJsonValue,
      terminalCode: outcome.terminalCode,
      stopReason: outcome.stopReason,
      affectedResources: outcome.affectedResources,
      usageSettlement: usageSettlementForTurn(payload, outcome),
      classifierTrace: buildAgentTurnClassifierTrace(outcome.auxiliaryCharges ?? [], outcome.retrievalTimings ?? []),
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
        stopReason: committed.stopReason,
        assistantMessageId: committed.assistantMessage.id,
        affectedResources: committed.affectedResources,
        hasSuccessfulMutation: outcome.hasSuccessfulMutation,
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
      const transcript = new AgentTurnTranscript(() => undefined, payload.appBaseUrl);
      transcript.appendText(message);
      await publishAssistantText(message);
      await finalizeTurn(payload, {
        parts: transcript.replyParts,
        terminalCode: "partial",
        stopReason: "hosted_ai_unavailable",
        affectedResources: [],
        hasSuccessfulMutation: false,
        tokens: emptyTokens(),
        ledger: [],
        reservedMicrocents: payload.turnBudget.reservedMicrocents,
        providerStarted: false,
      });
      await closeTurnStream();
      return;
    }
    const surface: AgentTurnSurface = payload.surface ?? "chat";
    const approvalWindowMs = approvalWindowMsForSurface(surface);
    const shells = await loadAgentToolShells(surface, payload.turnBudget.servingProvider, {
      locale: payload.locale,
      wikiWebsiteSetup: Boolean(payload.wikiWebsiteSetup),
    });
    const writable = getWritable();

    const queued: AgentTranscriptEvent[] = [];
    const transcript = new AgentTurnTranscript((event) => {
      if ((AGENT_TRANSCRIPT_FORWARDED_EVENTS as readonly string[]).includes(event.type)) queued.push(event);
    }, payload.appBaseUrl);

    const initialToolsets = payload.toolsets ?? [];
    const systemPrompt = agentSystemPromptParts({
      userName: payload.userName,
      locale: payload.locale,
      surface,
      loadedToolsets: initialToolsets,
      schemaDigest: payload.schemaDigest ?? null,
      triggerEvent: routineTriggerEventOf(payload.messages.findLast((message) => message.role === "user")?.text),
      wikiWebsiteSetup: Boolean(payload.wikiWebsiteSetup),
    });
    const toolDefinitions = shells.map(
      ({ annotations: _annotations, gated: _gated, toolset: _toolset, ...definition }) => definition,
    );
    const activeToolNamesFor = (stepMessages: readonly unknown[]) =>
      activeAgentToolNames({
        tools: shells,
        initialToolsets,
        messages: stepMessages,
      });
    const providerContext = buildAgentProviderContext(
      systemPrompt,
      payload.messages,
      toolDefinitions.filter((definition) => activeToolNamesFor([])?.includes(definition.name)),
      await authorizedWikiCatalog(payload),
    );
    const auxiliaryCharges: ClassifierCharge[] = [];
    const retrievalTimings: RetrievalTiming[] = [];

    let tokens = emptyTokens();
    let cancelled = await readCancellation(payload);
    let roundIndex = 0;
    let appliedThisCall = 0;
    let finishReason = "unknown";
    const ledger: RoundLedgerEntry[] = [];
    let unreportedProviderRounds = 0;
    const grants = new Map<string, ToolApprovalGrant>();
    const resolveToolInput = createAgentToolInputResolver((toolName, input) =>
      normalizeAgentToolInput(payload, toolName, input),
    );
    const completedTools: ({ toolCallId: string; toolName: string } & ({ output: unknown } | { threw: true }))[] = [];
    let performedWrite = false;
    let browsed = false;
    let webPageReads = 0;
    const webPageReadLimit = agentWebPageCallLimit(surface);
    const webSources = new Set<string>();

    const continuationSteps: AgentContinuationStep[] = [];
    let deferredRound: {
      step: AgentRoundResult;
      outcomes: AgentToolOutcome[];
    } | null = null;
    let providerStop: Extract<AgentTurnStopReason, "provider_error" | "content_filter" | "turn_error"> | null = null;
    let resolvedProviderErrorRetries = 0;
    let rateLimitRetries = 0;
    let toolExecutedThisCall = false;
    let providerFailure: WorkflowFailure | null = null;
    let budgetStop = false;
    let hostedAiStop = false;
    const hostedAiPaused = new Error("Hosted AI provider work is paused.");
    let abandoned = false;
    let reservedMicrocents = payload.turnBudget.reservedMicrocents;
    let roundFailure: WorkflowFailure | null = null;
    const settledToolCallIds = new Set<string>();

    const recordContinuationRound = (step: AgentRoundResult, outcomes: AgentToolOutcome[]) => {
      continuationSteps.push(toAgentContinuationStep(step, outcomes));
      const loop = decideAgentContinuationLoop({ steps: continuationSteps });
      if (loop.action === "error") providerStop = loop.reason;
      else if (!["stop", "length", "tool-calls"].includes(step.finishReason)) providerStop = "provider_error";
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

    const benchmarkToolOutputs: AgentToolOutcome[] = [];
    const recordBenchmarkToolOutput = (outcome: AgentToolOutcome) => {
      if (payload.recordToolOutputs) benchmarkToolOutputs.push(outcome);
    };

    const settleToolOutcome = (toolCallId: string, toolName: string | undefined, output: unknown) => {
      if (settledToolCallIds.has(toolCallId)) return;
      settledToolCallIds.add(toolCallId);
      recordBenchmarkToolOutput({ toolCallId, toolName: toolName ?? "", output });

      const outcome = agentToolOutcomeStatus(output);
      transcript.completeToolCall({
        toolCallId,
        toolName,
        status: outcome.status,
        failed: outcome.failed,
        output,
      });
    };

    const approvedCalls = new Map<string, string>();
    const approvedOutcomes = new Map<string, AgentToolOutcome>();

    const toolResultIn = (
      stepMessages: readonly unknown[],
      toolCallId: string,
      toolName: string,
      requireToolName = false,
    ): Extract<AgentToolOutcome, { output: unknown }> | undefined => {
      for (const message of stepMessages) {
        const { role, content } = message as {
          role?: string;
          content?: unknown;
        };
        if (role !== "tool" || !Array.isArray(content)) continue;
        const part = (content as { type?: string; toolName?: string; toolCallId?: string; output?: unknown }[]).find(
          (candidate) =>
            candidate.type === "tool-result" &&
            candidate.toolCallId === toolCallId &&
            (!requireToolName || candidate.toolName === toolName),
        );
        if (part) return { toolCallId, toolName, output: unwrapToolOutput(part.output) };
      }
      return undefined;
    };

    const settleApprovedCalls = (stepMessages: readonly unknown[], final: boolean) => {
      if (approvedCalls.size === 0) return;
      const calls = [...approvedCalls];
      const found = calls.map(
        ([toolCallId, toolName]) =>
          approvedOutcomes.get(toolCallId) ?? toolResultIn(stepMessages, toolCallId, toolName),
      );
      if (!final && found.some((outcome) => outcome === undefined)) return;
      approvedCalls.clear();
      approvedOutcomes.clear();

      for (const outcome of found) {
        if (!outcome) continue;
        if (!("threw" in outcome)) settleToolOutcome(outcome.toolCallId, outcome.toolName, outcome.output);
        else if (!settledToolCallIds.has(outcome.toolCallId)) {
          settledToolCallIds.add(outcome.toolCallId);
          recordBenchmarkToolOutput(outcome);
          transcript.failToolCall(outcome.toolCallId);
        }
      }
      resolveDeferredRound(
        calls.map(([toolCallId, toolName], index) => found[index] ?? { toolCallId, toolName, threw: true as const }),
      );
    };

    const runShellTool = async (
      shell: AgentToolShell,
      input: unknown,
      toolCallId: string,
      stepMessages: readonly unknown[],
    ) => {
      const prepared = await resolveToolInput(shell.name, toolCallId, input);
      if (!prepared.ok) return prepared;
      const webRead = isAgentWebTool(shell.name);
      if (webRead && isUnattendedSurface(surface) && performedWrite) {
        return {
          ok: false,
          result: "This routine already changed data, so it cannot read web pages any more. Nothing was read.",
        };
      }
      if (webRead && webPageReads >= webPageReadLimit) {
        return {
          ok: false,
          result: `The limit of ${webPageReadLimit} page reads per ${isUnattendedSurface(surface) ? "run" : "reply"} is reached. Answer from what you already have. Nothing was read.`,
        };
      }
      if (webRead) webPageReads += 1;
      const readOnly = isReadOnlyAgentToolCall(shell.name, shell, prepared.input);
      let executionInput = prepared.input;
      if (payload.wikiWebsiteSetup && shell.name === WIKI_WEBSITE_IMPORT_TOOL_NAME) {
        if (!(await authorizedWikiSetup(payload))) {
          return {
            ok: false,
            result:
              "Website import is not available: it needs Knowledge Base create access and an empty Knowledge Base, or a help centre that an earlier import listed. Nothing was started.",
          };
        }
        const homepage = userWebsiteHomepage(
          payload.wikiWebsiteSetup.userHomepages,
          (prepared.input as { url: string }).url,
        );
        if (!homepage) {
          return {
            ok: false,
            result:
              "Import only a website the user wrote in this conversation. Ask the user for the address first. Nothing was started.",
          };
        }
        executionInput = { url: homepage.url };
      }
      if (
        isUnattendedSurface(surface) &&
        !readOnly &&
        (browsed || agentBatchContainsWebCall(stepMessages, toolCallId))
      ) {
        return {
          ok: false,
          result:
            "This routine cannot mutate data after browsing or in a batch containing web access. Nothing was changed.",
        };
      }
      const executed = await executeAgentTool(
        payload,
        shell.name,
        toolCallId,
        executionInput,
        grants.get(toolCallId) ?? "not-required",
      );
      auxiliaryCharges.push(...executed.classifierCharges);
      retrievalTimings.push(...(executed.retrievalTimings ?? []));
      const outcome = executed.output;
      if (webRead && isSuccessfulAgentWebResult(outcome)) browsed = true;
      if (!readOnly && isSuccessfulToolOutcome(outcome)) performedWrite = true;
      return outcome;
    };

    const accruedCostMicrocents = () =>
      ledger.reduce((total, entry) => total + entry.costMicrocents, 0) +
      agentAuxiliaryCharge(auxiliaryCharges).costMicrocents;

    const fundedRetryCount = () =>
      agentFundedRetryCount({
        remainingMicrocents: Math.max(0, reservedMicrocents - accruedCostMicrocents()),
        roundReserveMicrocents: payload.turnBudget.roundReserveMicrocents,
        maxRetries: AGENT_MODEL_DEFAULT_MAX_RETRIES,
      });

    const ensureReservation = async (requiredMicrocents: number): Promise<boolean> => {
      if (requiredMicrocents <= reservedMicrocents) return true;
      const extension = await ensureTurnReservation(payload, requiredMicrocents);
      if (extension.disposition === "extended") {
        reservedMicrocents = extension.reservedMicrocents;
        return true;
      }
      if (extension.disposition === "credit_limit") budgetStop = true;
      else if (extension.disposition === "hosted_ai_unavailable") hostedAiStop = true;
      else roundFailure ??= toWorkflowFailure(new Error("Agent usage reservation is no longer available."));
      return false;
    };

    const applyRound = async (step: AgentRoundResult) => {
      appliedThisCall += 1;
      rateLimitRetries = 0;
      try {
        settleApprovedCalls([], true);
        for (const source of collectAgentWebSources([{ content: step.content }])) webSources.add(source);
        for (const raw of step.content) {
          const part = raw as {
            type?: string;
            toolName?: string;
            output?: unknown;
          };
          if (
            part.type === "tool-result" &&
            part.toolName &&
            isAgentWebTool(part.toolName) &&
            isSuccessfulAgentWebResult(part.output)
          )
            browsed = true;
        }
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

        const outcomesByCallId = new Map<string, AgentToolOutcome>(
          completedTools.splice(0).map((outcome) => [outcome.toolCallId, outcome]),
        );
        for (const raw of step.content) {
          const part = raw as {
            type?: string;
            toolCallId?: string;
            toolName?: string;
            output?: unknown;
            providerExecuted?: boolean;
          };
          if (
            part.providerExecuted !== true ||
            !part.toolCallId ||
            !part.toolName ||
            (part.type !== "tool-result" && part.type !== "tool-error")
          )
            continue;
          outcomesByCallId.set(part.toolCallId, {
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            ...(part.type === "tool-error" ? { threw: true as const } : { output: part.output }),
          });
        }
        const outcomes = [...outcomesByCallId.values()];
        for (const completed of outcomes) {
          if ("threw" in completed) {
            if (settledToolCallIds.has(completed.toolCallId)) continue;
            settledToolCallIds.add(completed.toolCallId);
            recordBenchmarkToolOutput(completed);
            transcript.failToolCall(completed.toolCallId);
            continue;
          }

          settleToolOutcome(completed.toolCallId, completed.toolName, completed.output);
        }

        let roundTokens = emptyTokens();
        try {
          roundTokens = usageToTokenCounts(step.usage);
        } catch (error) {
          roundFailure ??= toWorkflowFailure(error);
        }
        const hasTokenUsage = Object.values(roundTokens).some((count) => count > 0);
        const servedCharge = readAgentServedCharge(step.providerMetadata, payload.turnBudget.servingProvider);
        const charge =
          servedCharge.outcome === "tokenPriced" && !hasTokenUsage
            ? ({
                outcome: "unreadable",
                reason: "the provider reported no token usage for a round it issues no receipt for",
              } as const)
            : servedCharge;
        const tokenPriced = charge.outcome === "tokenPriced";
        const roundCharge = readAgentProviderRoundCharge(step.providerMetadata, payload.turnBudget.servingProvider);
        const gatewayDebitMicrocents = readGatewayCostMicrocents(step.providerMetadata);
        const hasPositiveGatewayDebit = (gatewayDebitMicrocents ?? 0) > 0;
        const remainingReservationMicrocents = Math.max(0, reservedMicrocents - accruedCostMicrocents());
        const estimatedInferenceMicrocents =
          charge.outcome === "measured" || charge.outcome === "notBilled"
            ? 0
            : !hasPositiveGatewayDebit && !hasTokenUsage
              ? Math.max(1, Math.min(payload.turnBudget.roundReserveMicrocents, remainingReservationMicrocents))
              : computeCostMicrocents(
                  payload.turnBudget.modelSpec,
                  roundTokens,
                  payload.turnBudget.servingProvider,
                  payload.turnBudget.inferenceRegion,
                );
        const standaloneCostMicrocents =
          charge.outcome === "measured"
            ? charge.charge.costMicrocents
            : charge.outcome === "notBilled"
              ? Math.max(gatewayDebitMicrocents ?? 0, 0)
              : Math.max(gatewayDebitMicrocents ?? 0, estimatedInferenceMicrocents);

        const aggregateCostMicrocents = roundCharge
          ? roundCharge.measured
            ? roundCharge.costMicrocents
            : Math.max(roundCharge.costMicrocents, remainingReservationMicrocents)
          : standaloneCostMicrocents;
        const safeAggregateCost = Number.isSafeInteger(aggregateCostMicrocents);
        const costMicrocents = Math.min(Number.MAX_SAFE_INTEGER, aggregateCostMicrocents);
        const measured = roundCharge
          ? roundCharge.measured && safeAggregateCost
          : charge.outcome === "measured" || charge.outcome === "notBilled";
        const unreadableReason = roundCharge
          ? !safeAggregateCost
            ? "the provider reported an unrepresentable aggregate cost"
            : roundCharge.unreadableReason
          : charge.outcome === "unreadable"
            ? charge.reason
            : undefined;

        tokens = addTokens(tokens, roundTokens);
        ledger.push({
          tokens: roundTokens,
          costMicrocents,
          measured,
          unreadableReason,
          ...(tokenPriced && !roundCharge ? { tokenPriced: true } : {}),
        });
        unreportedProviderRounds = Math.max(0, unreportedProviderRounds - 1);

        const roundOutcome = await persistRound(payload, {
          roundIndex: roundIndex++,
          parts: payload.recordToolOutputs
            ? [...step.content, ...benchmarkToolOutputs.splice(0).map(benchmarkToolOutputPart)]
            : step.content,
          finishReason: step.finishReason,
          tokens: roundTokens,
          reasoningTokens: step.usage?.outputTokenDetails?.reasoningTokens ?? 0,
          costMicrocents,
        });
        cancelled ||= roundOutcome.cancelled;
        abandoned ||= roundOutcome.leaseLost;
        await publishTranscriptEvents(queued.splice(0));

        const accruedMicrocents = accruedCostMicrocents();
        const needsAnotherProviderRound =
          !cancelled &&
          !abandoned &&
          !budgetStop &&
          !hostedAiStop &&
          providerStop === null &&
          roundFailure === null &&
          (step.finishReason === "length" || step.finishReason === "tool-calls");
        const requiredMicrocents =
          accruedMicrocents + (needsAnotherProviderRound ? payload.turnBudget.roundReserveMicrocents : 0);
        await ensureReservation(requiredMicrocents);

        const settledIds = new Set(outcomes.map((outcome) => outcome.toolCallId));
        const hasPausedCall = step.content.some((raw) => {
          const part = raw as { type?: string; toolCallId?: string };
          return part.type === "tool-call" && Boolean(part.toolCallId) && !settledIds.has(part.toolCallId as string);
        });

        if (hasPausedCall && step.finishReason === "tool-calls") {
          deferredRound = { step, outcomes };
          return;
        }

        const unrun = new Map<string, string | undefined>();
        for (const raw of step.content) {
          const part = raw as {
            type?: string;
            toolCallId?: string;
            toolName?: string;
          };
          if (part.type === "tool-call" && part.toolCallId && !settledIds.has(part.toolCallId))
            unrun.set(part.toolCallId, part.toolName);
        }
        for (const [toolCallId, toolName] of unrun) {
          if (settledToolCallIds.has(toolCallId)) continue;
          settledToolCallIds.add(toolCallId);
          transcript.completeToolCall({ toolCallId, toolName, status: "cancelled", failed: false });
        }

        recordContinuationRound(
          unrun.size > 0
            ? {
                ...step,
                content: step.content.filter((raw) => {
                  const part = raw as { type?: string; toolCallId?: string };
                  return !(part.type === "tool-call" && part.toolCallId && unrun.has(part.toolCallId));
                }),
              }
            : step,
          outcomes,
        );
      } catch (error) {
        roundFailure ??= toWorkflowFailure(
          error instanceof Error
            ? Object.assign(new Error(`Agent round failed while applying its result: ${error.message}`), {
                name: error.name,
                stack: error.stack,
              })
            : error,
        );
      }
    };

    let messages = providerContext.messages;
    let instructions = providerContext.system;
    let compactedContinuationCount = -1;
    let compactedRetainedResponseSteps = AGENT_CONTINUATION_RETAINED_RESPONSE_STEPS + 1;

    const compactForNextSegment = (continueOutput: boolean): boolean => {
      const minimumRetainedSteps = continueOutput ? 1 : 0;
      const maximumRetainedSteps =
        compactedContinuationCount === continuationSteps.length
          ? compactedRetainedResponseSteps - 1
          : AGENT_CONTINUATION_RETAINED_RESPONSE_STEPS;

      for (
        let retainedResponseSteps = Math.min(maximumRetainedSteps, continuationSteps.length);
        retainedResponseSteps >= minimumRetainedSteps;
        retainedResponseSteps -= 1
      ) {
        const compacted = compactAgentContinuationContext({
          system: providerContext.system,
          initialMessages: providerContext.messages,
          steps: continuationSteps,
          retainedResponseSteps,
          resultDigest: true,
        });
        const candidateMessages = continueOutput
          ? [
              ...compacted.messages,
              {
                role: "user" as const,
                content: AGENT_OUTPUT_CONTINUATION_PROMPT,
              },
            ]
          : [...compacted.messages];
        const activeForCandidate = activeToolNamesFor(candidateMessages);
        if (
          !isAgentStepContextWithinBudget(
            {
              ...providerContext,
              system: compacted.system,
              tools: activeForCandidate
                ? toolDefinitions.filter((definition) => activeForCandidate.includes(definition.name))
                : toolDefinitions,
            },
            candidateMessages,
            payload.turnBudget.maxContextBytes,
          )
        )
          continue;

        instructions = compacted.system;
        messages = candidateMessages;
        compactedContinuationCount = continuationSteps.length;
        compactedRetainedResponseSteps = retainedResponseSteps;
        return true;
      }

      return false;
    };

    while (!abandoned && !cancelled && !budgetStop && !hostedAiStop && providerStop === null && roundFailure === null) {
      const agent = new WorkflowAgent({
        id: WORKFLOW_NAME,
        model: payload.turnBudget.modelSpec,
        instructions,
        tools: Object.fromEntries(
          shells.map((shell) => [
            shell.name,
            shell.type === "provider"
              ? ({
                  type: "provider",
                  id: shell.id,
                  args: shell.args,
                  isProviderExecuted: shell.isProviderExecuted,
                  supportsDeferredResults: shell.supportsDeferredResults,
                  inputSchema: jsonSchema(shell.inputSchema as never),
                } as never)
              : {
                  description: shell.description,
                  inputSchema: jsonSchema(shell.inputSchema as never),
                  needsApproval: async (input: unknown, options: { toolCallId: string }) => {
                    const prepared = await resolveToolInput(shell.name, options.toolCallId, input);
                    return (
                      prepared.ok &&
                      shell.gated &&
                      requiresApproval(
                        internalToolIdentity(shell.name),
                        { annotations: shell.annotations },
                        prepared.input,
                      )
                    );
                  },
                  ...(isAgentPanelTool(shell.name)
                    ? {}
                    : {
                        execute: async (
                          input: unknown,
                          options: {
                            toolCallId: string;
                            messages: readonly unknown[];
                          },
                        ) => {
                          const { toolCallId } = options;
                          toolExecutedThisCall = true;
                          try {
                            const output = await runShellTool(shell, input, toolCallId, options.messages);
                            if (approvedCalls.has(toolCallId))
                              approvedOutcomes.set(toolCallId, { toolCallId, toolName: shell.name, output });
                            return output;
                          } catch (error) {
                            if (approvedCalls.has(toolCallId))
                              approvedOutcomes.set(toolCallId, { toolCallId, toolName: shell.name, threw: true });
                            throw error;
                          }
                        },
                      }),
                },
          ]),
        ),
        maxOutputTokens: payload.turnBudget.maxOutputTokens,
        ...(payload.turnBudget.reasoningEffort ? { reasoning: payload.turnBudget.reasoningEffort } : {}),
        providerOptions: {
          ...getAgentProviderOptions(payload.turnBudget.servingProvider, payload.turnBudget.inferenceRegion),
          ...googleThinkingProviderOptions(payload.turnBudget),
        },
        prepareStep: async ({ messages: stepMessages }) => {
          settleApprovedCalls(stepMessages, false);
          if (abandoned || cancelled || budgetStop || hostedAiStop || providerStop !== null || roundFailure !== null)
            throw AGENT_LOCAL_TERMINATION_REQUIRED;
          const activeTools = activeToolNamesFor(stepMessages);
          const activeDefinitions = activeTools
            ? toolDefinitions.filter((definition) => activeTools.includes(definition.name))
            : toolDefinitions;
          if (
            !isAgentContextWithinBudget(
              {
                system: instructions,
                messages: stepMessages,
                tools: activeDefinitions,
              },
              payload.turnBudget.maxContextBytes,
            )
          )
            throw AGENT_CONTEXT_COMPACTION_REQUIRED;
          if (!(await canStartNextHostedAiProviderRound(payload))) throw hostedAiPaused;
          const webPageReadPermitted =
            webPageReads < webPageReadLimit && !(isUnattendedSurface(surface) && performedWrite);
          const maxRetries = fundedRetryCount();
          return {
            activeTools: webPageReadPermitted
              ? activeTools
              : activeTools.filter((toolName) => !isAgentWebTool(toolName)),
            ...(maxRetries < AGENT_MODEL_DEFAULT_MAX_RETRIES ? { maxRetries } : {}),
          };
        },
        telemetry: {
          recordInputs: false,
          recordOutputs: false,
          integrations: {
            onLanguageModelCallStart: () => {
              unreportedProviderRounds += 1;
            },
          },
        },
        stopWhen: [
          isStepCount(AGENT_SEGMENT_ROUNDS),
          () => abandoned || cancelled || budgetStop || hostedAiStop || providerStop !== null || roundFailure !== null,
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
      toolExecutedThisCall = false;
      let result;
      try {
        result = await agent.stream({
          messages,
          writable,
          preventClose: true,
          sendFinish: false,
        });
      } catch (error) {
        settleApprovedCalls([], true);
        if (error === AGENT_LOCAL_TERMINATION_REQUIRED) break;
        if (error === hostedAiPaused) {
          hostedAiStop = true;
          break;
        }
        if (error === AGENT_CONTEXT_COMPACTION_REQUIRED) {
          const continueOutput = continuationSteps.at(-1)?.finishReason === "length";
          if (continuationSteps.length === 0 || !compactForNextSegment(continueOutput)) {
            roundFailure = toWorkflowFailure(
              new Error("Agent context could not be compacted within its provider budget."),
            );
            break;
          }
          continue;
        }
        const failureCharge = readAgentProviderErrorCharge(error, payload.turnBudget.servingProvider);
        if (failureCharge && unreportedProviderRounds > 0) {
          const remainingReservationMicrocents = Math.max(0, reservedMicrocents - accruedCostMicrocents());
          ledger.push({
            tokens: emptyTokens(),
            costMicrocents: failureCharge.measured
              ? failureCharge.costMicrocents
              : Math.max(failureCharge.costMicrocents, remainingReservationMicrocents),
            measured: failureCharge.measured,
            unreadableReason: failureCharge.unreadableReason,
          });
          unreportedProviderRounds -= 1;
        }
        const rateLimit = readAgentProviderRateLimit(error);
        if (
          rateLimit &&
          failureCharge &&
          unreportedProviderRounds === 0 &&
          rateLimitRetries < Math.min(AGENT_RATE_LIMIT_RETRIES, fundedRetryCount()) &&
          (appliedThisCall === 0 && !toolExecutedThisCall
            ? true
            : continuationSteps.length > 0 &&
              compactForNextSegment(continuationSteps.at(-1)?.finishReason === "length"))
        ) {
          rateLimitRetries += 1;
          const delayMs = agentRateLimitRetryDelayMs(rateLimitRetries, rateLimit.retryAfterMs);
          await reportWarning(
            WORKFLOW_NAME,
            `The provider rate-limited a round with HTTP 429 (retry ${rateLimitRetries} of ${AGENT_RATE_LIMIT_RETRIES}, after ${delayMs} ms).`,
            payload.tenant,
          );
          await sleep(delayMs);
          cancelled = await readCancellation(payload);
          continue;
        }
        const failure = toWorkflowFailure(error);
        if (failureCharge?.providerFailure !== false && (failureCharge || isAgentProviderFailure(error))) {
          providerFailure = failure;
          providerStop = "provider_error";
        } else roundFailure = failure;
        break;
      }
      await publishStreamCheckpoint();
      finishReason = result.finishReason;
      settleApprovedCalls(result.messages, true);
      for (const source of collectAgentWebSources(result.messages)) webSources.add(source);

      for (const step of (result.steps as unknown as AgentRoundResult[]).slice(appliedThisCall)) await applyRound(step);

      for (const message of result.messages) {
        if (message.role !== "tool" || typeof message.content === "string") continue;
        for (const part of message.content) {
          if (part.type !== "tool-result") continue;
          settleToolOutcome(part.toolCallId, part.toolName, unwrapToolOutput(part.output));
        }
      }

      if (finishReason === "content-filter") providerStop = "content_filter";
      else if (!["stop", "length", "tool-calls"].includes(finishReason)) {
        const resolvedError = (result as { error?: unknown }).error;
        const failedStepRanProviderTool = (result.steps as unknown as AgentRoundResult[])
          .at(-1)
          ?.content.some((raw) => {
            const part = raw as { type?: string; providerExecuted?: boolean };
            return part.type === "tool-call" && part.providerExecuted === true;
          });
        if (!failedStepRanProviderTool && resolvedProviderErrorRetries < AGENT_RESOLVED_PROVIDER_ERROR_RETRIES) {
          resolvedProviderErrorRetries += 1;
          await reportResolvedProviderError(payload, finishReason, resolvedError, resolvedProviderErrorRetries);
          providerStop = null;
          messages = nextAgentSegmentMessages({
            messages: result.messages,
            finishReason,
            lastStep: continuationSteps.at(-1),
          });
          continue;
        }
        await reportResolvedProviderError(payload, finishReason, resolvedError, resolvedProviderErrorRetries + 1);
        providerStop = "provider_error";
      }

      if (abandoned) break;
      if (cancelled || budgetStop || hostedAiStop || providerStop !== null || roundFailure !== null) break;

      let pending = pendingApprovalCalls(result.messages);
      if (pending.length === 0) {
        if (finishReason === "stop") break;
        if (cancelled || budgetStop || providerStop !== null || roundFailure !== null) break;

        const carried = nextAgentSegmentMessages({
          messages: result.messages,
          finishReason,
          lastStep: continuationSteps.at(-1),
        });
        const fitsWhole = isAgentStepContextWithinBudget(
          { ...providerContext, system: instructions },
          carried,
          payload.turnBudget.maxContextBytes,
        );
        if (fitsWhole) {
          messages = carried;
          continue;
        }

        if (!compactForNextSegment(finishReason === "length")) {
          roundFailure = toWorkflowFailure(
            new Error("Agent context could not be compacted within its provider budget."),
          );
          break;
        }
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

      const hook =
        approvalWindowMs > 0
          ? createHook<AgentApprovalWake>({
              token: agentApprovalHookToken(payload.conversationId),
            })
          : null;
      await openApprovalRequests(payload, requests, approvalWindowMs);
      for (const request of requests) {
        transcript.beginApproval(
          request.requestId,
          describeAgentTool(internalToolIdentity(request.toolName), request.input),
        );
      }
      await publishTranscriptEvents(queued.splice(0));

      if (hook) {
        const requestIds = new Set(requests.map((request) => request.requestId));
        await Promise.race([
          (async () => {
            for await (const wake of hook) if (isRelevantAgentApprovalWake(wake, requestIds)) return;
          })(),
          sleep(approvalWindowMs),
        ]);
        hook.dispose();
      }

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

      const requestedToolName = (toolCallId: string) =>
        requests.find((request) => request.toolCallId === toolCallId)?.toolName ?? "";
      for (const outcome of outcomes) {
        if (outcome.decision === "approve")
          approvedCalls.set(outcome.toolCallId, requestedToolName(outcome.toolCallId));
      }
      const declined = outcomes.flatMap((outcome) =>
        outcome.decision === "approve"
          ? []
          : [
              {
                toolCallId: outcome.toolCallId,
                toolName: requestedToolName(outcome.toolCallId),
                output: approvalDeclineResult(outcome.decision, surface),
              },
            ],
      );
      if (approvedCalls.size > 0) appendDeferredOutcomes(declined);
      else resolveDeferredRound(declined);
      messages = withApprovalResponses(resumableMessages, outcomes, surface);
    }

    if (abandoned) {
      await closeTurnStream();
      return;
    }

    transcript.finishTextSegment();
    if (roundFailure) await reportFailure(WORKFLOW_NAME, roundFailure, payload.tenant);
    if (providerFailure) await reportFailure(WORKFLOW_NAME, providerFailure, payload.tenant);

    const stopReason: AgentTurnStopReason | null = cancelled
      ? "cancelled"
      : hostedAiStop
        ? "hosted_ai_unavailable"
        : budgetStop
          ? "credit_limit"
          : roundFailure
            ? "turn_error"
            : providerStop;
    const policyBreach =
      usageSettlementForTurn(payload, {
        tokens,
        ledger,
        reservedMicrocents,
        unreportedProviderRounds,
        auxiliaryCharges,
      })?.policyBreach === true;
    const effectiveStopReason: AgentTurnStopReason | null = policyBreach ? "policy_breach" : stopReason;
    const stopKind: AgentRunnerMessageKind | null =
      effectiveStopReason === "cancelled"
        ? "cancelled"
        : effectiveStopReason === "hosted_ai_unavailable"
          ? "hostedAiUnavailable"
          : effectiveStopReason === "credit_limit"
            ? performedWrite
              ? "creditLimit"
              : "creditLimitNoWrite"
            : effectiveStopReason === "turn_error"
              ? "turnError"
              : effectiveStopReason === "provider_error"
                ? "providerError"
                : effectiveStopReason === "content_filter"
                  ? "contentFilter"
                  : effectiveStopReason === "policy_breach"
                    ? "policyBreach"
                    : null;
    if (stopKind) {
      const message = await resolveRunnerMessage(payload.locale, stopKind);
      const trailing = transcript.replyText.trim() ? `\n\n${message}` : message;
      transcript.appendText(trailing);
      await publishAssistantText(trailing);
    } else if (webSources.size > 0 && transcript.replyText.trim()) {
      const sourceFooter = agentWebSourcesFooter(
        [...webSources],
        await resolveRunnerMessage(payload.locale, "sourcesHeading"),
      );
      if (sourceFooter) {
        transcript.appendText(sourceFooter);
        await publishAssistantText(sourceFooter);
      }
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
      stopReason,
      terminalCode: stopReason === "cancelled" ? "cancelled" : stopReason === null ? "completed" : "partial",
      affectedResources: transcript.affectedResources,
      hasSuccessfulMutation: transcript.hasSuccessfulMutation,
      tokens,
      ledger,
      reservedMicrocents,
      unreportedProviderRounds,
      auxiliaryCharges,
      retrievalTimings,
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
  } finally {
    if (payload.surface === "routine") {
      try {
        await settleRoutineRunStep(payload.userId);
      } catch {}
    }
  }
}
