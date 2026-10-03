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
import {
  wikiPlanningCandidates,
  wikiMissingOfferingCandidates,
  wikiMergeOfferingCandidates,
  wikiPlanningContext,
  wikiSourcePlanRepair,
  wikiSourcePlanRepairContext,
  wikiSourcePlanRefusal,
  type WikiSourcePlanRepair,
  wikiPageMatchesTopic,
  wikiSynthesisBatchSharesSources,
} from "./wiki-topic-plan";
import { wikiReadSourceEvidence } from "./wiki-source-evidence";
import {
  wikiSynthesisCreationRepair,
  wikiSynthesisCreationRepairMessages,
  type WikiSynthesisCreationRepair,
} from "./wiki-synthesis-creation-repair";
import { WIKI_SYNTHESIS_OWN_QUOTE_INSTRUCTION } from "@/ee/wiki-crawl/wiki-synthesis-grounding";
import {
  WIKI_SOURCE_PLAN_REPAIR_MAX_REFUSALS,
  wikiSourcePlanRepairMayReset,
  wikiSourcePlanRepairReadGuard,
  wikiSourcePlanRepairReadComplete,
  wikiSourcePlanRepairReadContext,
  wikiSourcePlanReadOutcome,
  type WikiSourcePlanRepairReads,
} from "./wiki-source-plan-repair-reads";
import {
  prepareWikiSynthesisReview,
  wikiSynthesisReviewDecision,
  parseWikiSynthesisReviewReceipt,
  recordWikiSynthesisReviewCharge,
  WikiSynthesisReviewReceiptSchema,
  WIKI_SYNTHESIS_REVIEW_TOOL_NAME,
  type WikiSynthesisReviewEvaluation,
  WIKI_SYNTHESIS_REVIEW_DEADLINE_MS,
  WIKI_SYNTHESIS_REVIEW_MAX_REJECTIONS,
  type WikiSynthesisReviewRequest,
} from "./wiki-synthesis-review";
import { prepareWikiSourcePlanReviews } from "./wiki-source-plan-review";
import { classifierReservationMicrocents } from "@/ee/agent-chat/classifier/classifier-reservation";
import { serializeInteractorFailure } from "@/core/validation/validation.utils";
import { boundedAgentToolFailure } from "@/ee/agent-chat/agent-tool-failure";
import { appLocaleOrDefault } from "@/i18n/locale-registry";
import { CustomErrorCode } from "@/core/validation/validation.types";

import type { ReadWebsiteSourceInput, WikiSourceTopic } from "@/ee/wiki-crawl/wiki-crawl-synthesis.schema";
import { WIKI_SYNTHESIS_MAX_PAGES, WikiCrawlSynthesisCreateSchema } from "@/ee/wiki-crawl/wiki-crawl-synthesis.schema";

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
import type { PublicWikiHomepage } from "@/features/wiki/wiki-homepage";
import type { WikiWebsiteCrawlMode } from "@/features/wiki/wiki-crawl-mode.schema";
import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import {
  agentBatchContainsWebCall,
  isAgentWebTool,
  isSuccessfulAgentWebResult,
} from "@/ee/agent-chat/agent-web-policy";
import {
  AGENT_WEB_SEARCH_TOOL_NAME,
  AGENT_WEB_SEARCH_WORST_CASE_MICROCENTS,
  agentWebSearchCallLimit,
  agentWebSearchCallsInStep,
  agentWebSearchChargeableCallsInStep,
  agentWebSourcesFooter,
  collectAgentWebSources,
} from "@/ee/agent-chat/agent-web-search";
import { userWebsiteHomepage } from "@/ee/agent-chat/user-website-homepages";
import { buildAgentUsageSettlement, usageToTokenCounts } from "@/ee/agent-chat/agent-usage-settlement";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";
import { agentMicrocentsToCredits } from "@/core/commercial/agent-credits";
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
import { readAgentProviderCharge, readGatewayCostMicrocents } from "@/ee/agent-chat/gateway-cost";
import { readAgentProviderErrorCharge, readAgentProviderRoundCharge } from "@/ee/agent-chat/agent-provider-error";
import { isReadOnlyAgentToolCall, requiresApproval } from "@/ee/agent-chat/gated-tools";
import { isAgentToolCancellation } from "@/ee/agent-chat/agent-tool-cancellation";
import { createAgentToolInputResolver, type AgentToolInputResult } from "@/ee/agent-chat/agent-tool-input";
import { resolveAgentApprovalContext } from "@/ee/agent-chat/agent-external-approval-context";
import {
  agentFundedRetryCount,
  agentWebSearchReserveMicrocents,
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
  wikiHomepageSetup?: PublicWikiHomepage;
  wikiCrawl?: {
    id: string;
    homepage: string;
    pendingHosts: string[];
    mode?: WikiWebsiteCrawlMode;
  };
  wikiWebsiteSetup?: { userHomepages: string[] };
  wikiCatalog?: string | null;
  webSearchEnabled?: boolean;
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
  if (!measured && (outcome.ledger.length > 0 || unreportedProviderRounds > 0)) {
    void reportWarning(
      WORKFLOW_NAME,
      `Agent usage settled from modelled cost because the provider charge was unreadable (${unreadableReason ?? "no reason"}) for ${outcome.ledger.filter((entry) => !entry.measured).length + unreportedProviderRounds} of ${outcome.ledger.length + unreportedProviderRounds} rounds on ${payload.turnBudget.modelSpec}.`,
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
      if (toolName === "read_website_source") {
        return runInTransaction(
          async () => {
            const receipt = await repo.claimAgentToolReceiptUnscoped({
              turnRequestId: payload.turnRequestId,
              companyId: payload.companyId,
              toolCallId,
              toolName,
            });
            if (receipt.state === "settled") return receipt.resultJson as Awaited<ReturnType<typeof run>>;
            const result = await run();
            await repo.settleAgentToolReceiptUnscoped({
              turnRequestId: payload.turnRequestId,
              companyId: payload.companyId,
              toolCallId,
              resultJson: result as Prisma.InputJsonValue,
            });
            return result;
          },
          { companyId: payload.companyId },
        );
      }
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
  reviewedWikiCreate = false,
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
    wikiHomepageSetup: Boolean(payload.wikiHomepageSetup),
    wikiCrawlId: payload.wikiCrawl?.id ?? null,
    wikiCrawlMode: payload.wikiCrawl ? (payload.wikiCrawl.mode ?? "initial") : null,
    wikiWebsiteSetup: Boolean(payload.wikiWebsiteSetup),
    webSearchEnabled: payload.webSearchEnabled,
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
  if (!reviewedWikiCreate) return run();
  if (
    !payload.wikiCrawl ||
    !payload.wikiHomepageSetup ||
    (payload.wikiCrawl.mode ?? "initial") !== "initial" ||
    toolName !== "manage_wiki_pages" ||
    !WikiCrawlSynthesisCreateSchema.safeParse(input).success
  )
    throw new Error("Invalid reviewed Wiki mutation.");
  return runAsBackgroundTenant(payload.userId, () =>
    runInTransaction(
      async () => {
        if (getTenantUser().companyId !== payload.companyId) throw new Error("Wiki synthesis tenant changed.");
        const repo = getAgentChatRepo();
        if (
          (await repo.isAgentTurnCancellationRequestedUnscoped({
            turnRequestId: payload.turnRequestId,
            companyId: payload.companyId,
          })) ||
          !(await repo.canStartNextHostedAiProviderRoundUnscoped({
            turnRequestId: payload.turnRequestId,
            companyId: payload.companyId,
            userId: payload.userId,
          }))
        ) {
          return {
            output: await formatWikiSynthesisReviewFailure(
              payload,
              CustomErrorCode.wikiSourceReviewUnavailable,
              [{ path: ["pages"] }],
              "unavailable",
            ),
            classifierCharges: [],
            retrievalTimings: [],
          };
        }
        return run();
      },
      { companyId: payload.companyId },
    ),
  );
}
executeAgentTool.maxRetries = 0;

async function loadWikiSynthesisReviewContext(payload: AgentTurnWorkflowPayload) {
  "use step";
  if (
    !payload.wikiCrawl ||
    !payload.wikiHomepageSetup ||
    (payload.surface ?? "chat") !== "chat" ||
    (payload.wikiCrawl.mode ?? "initial") !== "initial"
  )
    return null;
  const { getUserService, getWikiWebsiteCrawlRepo } = await import("@/core/di");
  const { Action, Resource } = await import("@/generated/prisma");
  const { env } = await import("@/env");
  const { wikiSourceCoverage } = await import("@/ee/wiki-crawl/wiki-source-coverage");
  if (env.APP_MODE !== "cloud") return null;
  const { id, homepage } = payload.wikiCrawl;
  return runAsBackgroundTenant(payload.userId, async () => {
    if (getTenantUser().companyId !== payload.companyId) throw new Error("Wiki synthesis tenant changed.");
    if (!(await getUserService().hasPermission(Resource.wiki, Action.create))) return null;
    const repo = getWikiWebsiteCrawlRepo();
    const crawl = await repo.getCrawl(id);
    if (!crawl || crawl.userId !== payload.userId || crawl.homepageUrl !== homepage) return null;
    if (crawl.mode !== "initial") return null;
    const coverage = await wikiSourceCoverage(repo, id);
    const savedPages = await repo.listSynthesizedPages(crawl.startedAt, WIKI_SYNTHESIS_MAX_PAGES);
    return {
      sources: coverage.sources.map(({ id, title, text, contentHash }) => ({ id, title, text, contentHash })),
      pending: coverage.pending.length,
      readHashes: [...coverage.readHashes],
      savedPages,
    };
  });
}
loadWikiSynthesisReviewContext.maxRetries = 0;

async function executeWikiSynthesisReview(
  payload: AgentTurnWorkflowPayload,
  request: WikiSynthesisReviewRequest,
): Promise<WikiSynthesisReviewEvaluation> {
  "use step";
  const { createHash } = await import("node:crypto");
  const { getAgentChatRepo } = await import("@/core/di");
  const { classifyMetered } = await import("@/ee/agent-chat/classifier/metered");
  const requestSha256 = createHash("sha256")
    .update(JSON.stringify({ spec: request.spec, state: request.state }))
    .digest("hex");
  const receiptKey = `${WIKI_SYNTHESIS_REVIEW_TOOL_NAME}:${requestSha256}`;
  const initial = WikiSynthesisReviewReceiptSchema.parse({
    schemaVersion: 1,
    requestSha256,
    result: null,
    charge: {
      use: WIKI_SYNTHESIS_REVIEW_TOOL_NAME,
      model: "jev",
      costMicrocents: classifierReservationMicrocents(request.spec, request.state),
      measured: false,
      answered: false,
    },
  });
  return runAsBackgroundTenant(payload.userId, async () => {
    if (getTenantUser().companyId !== payload.companyId) throw new Error("Wiki synthesis tenant changed.");
    const repo = getAgentChatRepo();
    const identity = {
      turnRequestId: payload.turnRequestId,
      companyId: payload.companyId,
      toolCallId: receiptKey,
      toolName: WIKI_SYNTHESIS_REVIEW_TOOL_NAME,
    };
    const claim = await repo.claimAgentClassifierReceiptOrThrowUnscoped({ ...identity, initialResultJson: initial });
    const saved = parseWikiSynthesisReviewReceipt(claim.resultJson, requestSha256);
    if (claim.state === "settled") return { receiptKey, settled: true, result: saved.result, charge: saved.charge };
    if (saved.result !== null || !saved.charge || saved.charge.measured || saved.charge.answered)
      throw new Error("Unsettled Wiki synthesis review receipt is invalid.");
    if (claim.state === "unknown") return { receiptKey, settled: false, result: null, charge: saved.charge };
    const allowed =
      !(await repo.isAgentTurnCancellationRequestedUnscoped({
        turnRequestId: payload.turnRequestId,
        companyId: payload.companyId,
      })) &&
      (await repo.canStartNextHostedAiProviderRoundUnscoped({
        turnRequestId: payload.turnRequestId,
        companyId: payload.companyId,
        userId: payload.userId,
      }));
    const evaluated = allowed
      ? await classifyMetered(WIKI_SYNTHESIS_REVIEW_TOOL_NAME, request.spec, request.state, "jev", {
          timeoutMs: WIKI_SYNTHESIS_REVIEW_DEADLINE_MS,
        })
      : { result: null, charge: null };
    const settled = WikiSynthesisReviewReceiptSchema.parse({ schemaVersion: 1, requestSha256, ...evaluated });
    await repo.settleAgentClassifierReceiptUnscoped({ ...identity, resultJson: settled });
    return { receiptKey, settled: true, result: settled.result, charge: settled.charge };
  });
}
executeWikiSynthesisReview.maxRetries = 0;

async function wikiSynthesisReviewFailure(
  payload: AgentTurnWorkflowPayload,
  code: CustomErrorCode,
  issues: Array<{ path: Array<string | number>; decision?: string; values?: Record<string, string | number> }>,
  kind: "validation" | "unavailable" = "validation",
  values: Record<string, string | number> = {},
) {
  "use step";
  return formatWikiSynthesisReviewFailure(payload, code, issues, kind, values);
}
wikiSynthesisReviewFailure.maxRetries = 0;

async function formatWikiSynthesisReviewFailure(
  payload: AgentTurnWorkflowPayload,
  code: CustomErrorCode,
  issues: Array<{ path: Array<string | number>; decision?: string; values?: Record<string, string | number> }>,
  kind: "validation" | "unavailable" = "validation",
  values: Record<string, string | number> = {},
) {
  const { z } = await import("zod");
  const { getTranslator } = await import("@/i18n/get-translator");
  const { serializeInteractorFailure } = await import("@/core/validation/validation.utils");
  const { boundedAgentToolFailure } = await import("@/ee/agent-chat/agent-tool-failure");
  const t = await getTranslator(appLocaleOrDefault(payload.locale), "Common.errors");
  let template = t.raw(code) as string;
  if (code === CustomErrorCode.wikiSourceClaimsUnsupported) template += ` ${WIKI_SYNTHESIS_OWN_QUOTE_INSTRUCTION}`;
  const messageFor = (issueValues: Record<string, string | number> = {}) => {
    let message = template;
    for (const [key, value] of Object.entries({ ...values, ...issueValues }))
      message = message.replaceAll(`{${key}}`, String(value));
    return message;
  };
  const error = new z.ZodError(
    issues.map(({ path, values: issueValues }) => ({
      code: "custom" as const,
      path,
      message: messageFor(issueValues),
      params: { error: code, kind },
    })),
  );
  const location = ({ path, decision }: (typeof issues)[number]) =>
    `${path.join(".")}${decision ? `: ${decision}` : ""}`;
  const result = issues.some((issue) => issue.values)
    ? issues.map((issue) => `${location(issue)}. ${messageFor(issue.values)}`).join("; ")
    : `${issues.map(location).join("; ")}. ${messageFor()}`;
  return boundedAgentToolFailure(
    { result, failure: serializeInteractorFailure(error, kind) },
    payload.turnBudget.maxToolResultChars,
  );
}

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

async function authorizedWikiCrawlSynthesis(payload: AgentTurnWorkflowPayload): Promise<boolean> {
  "use step";
  if (!payload.wikiCrawl || !payload.wikiHomepageSetup || (payload.surface ?? "chat") !== "chat") return false;
  const { getUserService, getWikiWebsiteCrawlRepo } = await import("@/core/di");
  const { getTenantUser } = await import("@/core/decorators/tenant-context");
  const { Action, Resource } = await import("@/generated/prisma");
  const { env } = await import("@/env");
  if (env.APP_MODE === "demo") return false;
  const crawlId = payload.wikiCrawl.id;
  return runAsBackgroundTenant(payload.userId, async () => {
    if (getTenantUser().companyId !== payload.companyId) return false;
    if (!(await getUserService().hasPermission(Resource.wiki, Action.create))) return false;
    const crawl = await getWikiWebsiteCrawlRepo().getCrawl(crawlId);
    return Boolean(crawl && crawl.userId === payload.userId && crawl.homepageUrl === payload.wikiCrawl?.homepage);
  });
}
authorizedWikiCrawlSynthesis.maxRetries = 0;

async function loadWikiSourceInventory(payload: AgentTurnWorkflowPayload): Promise<string | null> {
  "use step";
  if (!payload.wikiCrawl || !payload.wikiHomepageSetup || (payload.surface ?? "chat") !== "chat") return null;
  const { getUserService, getWikiWebsiteCrawlRepo } = await import("@/core/di");
  const { Action, Resource } = await import("@/generated/prisma");
  const { env } = await import("@/env");
  const { wikiSourceCoverage } = await import("@/ee/wiki-crawl/wiki-source-coverage");
  const { wikiSourceInventory } = await import("@/ee/wiki-crawl/wiki-source-inventory");
  if (env.APP_MODE === "demo") return null;
  const { id, homepage } = payload.wikiCrawl;
  return runAsBackgroundTenant(payload.userId, async () => {
    if (getTenantUser().companyId !== payload.companyId) throw new Error("Wiki synthesis tenant changed.");
    if (!(await getUserService().hasPermission(Resource.wiki, Action.create))) return null;
    const repo = getWikiWebsiteCrawlRepo();
    const crawl = await repo.getCrawl(id);
    if (!crawl || crawl.userId !== payload.userId || crawl.homepageUrl !== homepage) return null;
    const coverage = await wikiSourceCoverage(repo, id);
    return coverage.sources.length ? wikiSourceInventory(coverage.sources, coverage.imported) : null;
  });
}
loadWikiSourceInventory.maxRetries = 0;

async function pendingWikiSynthesisSources(payload: AgentTurnWorkflowPayload): Promise<number> {
  "use step";
  const crawlId = payload.wikiCrawl?.id;
  if (!crawlId) return 0;
  const { getWikiWebsiteCrawlRepo } = await import("@/core/di");
  const { wikiSourceCoverage } = await import("@/ee/wiki-crawl/wiki-source-coverage");
  return runAsBackgroundTenant(payload.userId, async () => {
    if (getTenantUser().companyId !== payload.companyId) throw new Error("Wiki synthesis tenant changed.");
    const coverage = await wikiSourceCoverage(getWikiWebsiteCrawlRepo(), crawlId);
    return coverage.pending.length;
  });
}

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
        wikiHomepageSetup: Boolean(payload.wikiHomepageSetup),
        wikiCrawlId: payload.wikiCrawl?.id ?? null,
        wikiCrawlMode: payload.wikiCrawl ? (payload.wikiCrawl.mode ?? "initial") : null,
        wikiWebsiteSetup: Boolean(payload.wikiWebsiteSetup),
        webSearchEnabled: payload.webSearchEnabled,
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
        creditsUsed: agentMicrocentsToCredits(committed.chargedMicrocents),
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
      wikiHomepageSetup: Boolean(payload.wikiHomepageSetup),
      wikiCrawlId: payload.wikiCrawl?.id ?? null,
      wikiCrawlMode: payload.wikiCrawl ? (payload.wikiCrawl.mode ?? "initial") : null,
      wikiWebsiteSetup: Boolean(payload.wikiWebsiteSetup),
      webSearchEnabled: payload.webSearchEnabled,
    });
    const writable = getWritable();

    const queued: AgentTranscriptEvent[] = [];
    const transcript = new AgentTurnTranscript((event) => {
      if ((AGENT_TRANSCRIPT_FORWARDED_EVENTS as readonly string[]).includes(event.type)) queued.push(event);
    }, payload.appBaseUrl);

    const initialToolsets = payload.toolsets ?? [];
    const wikiSourceInventory = payload.wikiCrawl ? await loadWikiSourceInventory(payload) : null;
    const systemPrompt = agentSystemPromptParts({
      userName: payload.userName,
      locale: payload.locale,
      surface,
      loadedToolsets: initialToolsets,
      schemaDigest: payload.schemaDigest ?? null,
      triggerEvent: routineTriggerEventOf(payload.messages.findLast((message) => message.role === "user")?.text),
      wikiHomepageSetup: Boolean(payload.wikiHomepageSetup),
      wikiCrawlSynthesis: payload.wikiCrawl
        ? {
            homepage: payload.wikiCrawl.homepage,
            pendingHosts: payload.wikiCrawl.pendingHosts,
            mode: payload.wikiCrawl.mode,
            sourceInventory: wikiSourceInventory,
          }
        : null,
      wikiWebsiteSetup: Boolean(payload.wikiWebsiteSetup),
      webSearchEnabled: payload.webSearchEnabled,
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
    let webSearchCalls = 0;
    let webSearchOvershoot = false;
    const webSearchCallLimit = agentWebSearchCallLimit(surface);
    const webSources = new Set<string>();

    const continuationSteps: AgentContinuationStep[] = [];
    let deferredRound: {
      step: AgentRoundResult;
      outcomes: AgentToolOutcome[];
    } | null = null;
    let providerStop: Extract<AgentTurnStopReason, "provider_error" | "content_filter" | "turn_error"> | null = null;
    let resolvedProviderErrorRetries = 0;
    let wikiCoverageReminders = 0;
    const wikiTopicPlanState = {
      topics: null as WikiSourceTopic[] | null,
      candidates: [] as WikiSourceTopic[],
      omittedFoundations: [] as NonNullable<ReadWebsiteSourceInput["omittedFoundations"]>,
    };
    let wikiPlanReviewRejections = 0;
    let wikiTopicReminders = 0;
    const wikiFreshSources = new Map<string, { toolCallId: string; result: string }>();
    const wikiApprovedReviews = new Set<string>();
    const wikiReviewChargeIndices = new Map<string, number>();
    const wikiReviewRejections = new Map<string, number>();
    let wikiContinuationPrompt: string | null = null;
    let wikiCreationRepair: WikiSynthesisCreationRepair | null = null;
    const wikiCreationRepairContexts = new Set<string>();
    const withWikiCreationRepair = (candidateMessages: readonly ModelMessage[]) =>
      wikiSynthesisCreationRepairMessages(candidateMessages, wikiCreationRepair, wikiCreationRepairContexts);
    let wikiPlanRepair: WikiSourcePlanRepair | null = null;
    let wikiPlanRepairReads: WikiSourcePlanRepairReads | null = null;
    let wikiPlanRepairReadRefusals = 0;
    const retainWikiPlanRepair = (input: unknown, outcome: unknown) => {
      const repair = wikiSourcePlanRepair(input, outcome);
      if (!repair) return;
      if (wikiSourceInventory && wikiSourcePlanRepairMayReset(wikiPlanRepair, input, wikiSourceInventory)) {
        wikiPlanRepairReads = null;
        wikiPlanRepairReadRefusals = 0;
      }
      wikiPlanRepair = repair;
    };
    const wikiPlanRepairContext = () =>
      wikiPlanRepair
        ? `${wikiSourcePlanRepairContext(wikiPlanRepair)} ${wikiSourcePlanRepairReadContext(wikiPlanRepairReads)} Local read refusals: ${wikiPlanRepairReadRefusals}/${WIKI_SOURCE_PLAN_REPAIR_MAX_REFUSALS}.`
        : "";
    let providerFailure: WorkflowFailure | null = null;
    let budgetStop = false;
    let hostedAiStop = false;
    const hostedAiPaused = new Error("Hosted AI provider work is paused.");
    let abandoned = false;
    let reservedMicrocents = payload.turnBudget.reservedMicrocents;
    let roundFailure: WorkflowFailure | null = null;
    const recordWikiPlanRepairReadRefusal = () => {
      wikiPlanRepairReadRefusals += 1;
      if (wikiPlanRepairReadRefusals >= WIKI_SOURCE_PLAN_REPAIR_MAX_REFUSALS) providerStop = "turn_error";
    };
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

    const invokeShellTool = async (
      shell: AgentToolShell,
      input: unknown,
      toolCallId: string,
      stepMessages: readonly unknown[],
    ) => {
      const prepared = await resolveToolInput(shell.name, toolCallId, input);
      if (!prepared.ok) {
        if (
          wikiSourceInventory &&
          wikiPlanRepair &&
          wikiTopicPlanState.topics === null &&
          shell.name === "read_website_source"
        )
          recordWikiPlanRepairReadRefusal();
        return prepared;
      }
      const readOnly = isReadOnlyAgentToolCall(shell.name, shell, prepared.input);
      let executionInput = prepared.input;
      if (
        wikiTopicPlanState.topics !== null &&
        shell.name === "read_website_source" &&
        (executionInput as { action?: string }).action === "plan"
      ) {
        return wikiSourcePlanRefusal(
          "The source plan is already accepted. Continue its remaining exact titles; do not replace the plan.",
          payload.turnBudget.maxToolResultChars,
          "conflict",
        );
      }
      let repairRead: { replayed: boolean } | null = null;
      if (
        wikiSourceInventory &&
        wikiPlanRepair &&
        wikiTopicPlanState.topics === null &&
        shell.name === "read_website_source"
      ) {
        const remainingSources = await pendingWikiSynthesisSources(payload);
        const guarded = wikiSourcePlanRepairReadGuard(
          wikiPlanRepair,
          wikiPlanRepairReads,
          executionInput,
          toolCallId,
          wikiSourceInventory,
          remainingSources,
        );
        if (!guarded.ok) {
          recordWikiPlanRepairReadRefusal();
          return wikiSourcePlanRefusal(guarded.result, payload.turnBudget.maxToolResultChars, "conflict");
        }
        wikiPlanRepairReads = guarded.reads;
        repairRead = { replayed: guarded.replayed };
      }
      if (
        wikiSourceInventory &&
        shell.name === "read_website_source" &&
        (executionInput as ReadWebsiteSourceInput).action === "plan"
      ) {
        const missing = wikiMissingOfferingCandidates(
          wikiTopicPlanState.candidates,
          executionInput as ReadWebsiteSourceInput,
        );
        if (missing.length) {
          const refusal = wikiSourcePlanRefusal(
            `Retain these distinct offering candidates or explicitly reclassify each cited source with an exact evidence quote: ${wikiPlanningContext(missing)}. No plan was accepted.`,
            payload.turnBudget.maxToolResultChars,
          );
          retainWikiPlanRepair(executionInput, refusal);
          return refusal;
        }
      }
      if (wikiSourceInventory && shell.name === "manage_wiki_pages" && wikiTopicPlanState.topics === null) {
        return {
          ok: false,
          result: "First account for every stored source with read_website_source action=plan. No pages were created.",
        };
      }
      if (wikiTopicPlanState.topics && shell.name === "manage_wiki_pages") {
        const pages =
          (
            executionInput as {
              pages?: Array<{
                title: string;
                kind: string;
                sourceIds: string[];
              }>;
            }
          ).pages ?? [];
        if (new Set(pages.map(({ title }) => title)).size !== pages.length)
          return { ok: false, result: "Create each planned title only once per batch. No pages were created." };
        if (!wikiSynthesisBatchSharesSources(pages)) {
          return {
            ok: false,
            result:
              "Create multiple pages together only when their citation-source sets are identical. Use separate create calls for different source sets. No pages were created.",
          };
        }
        if (pages.some((page) => !wikiTopicPlanState.topics?.some((topic) => wikiPageMatchesTopic(topic, page)))) {
          return {
            ok: false,
            result:
              "Create only remaining planned titles with their matching kind. Offering and procedure pages must cite every planned source, with no extra or duplicate IDs. No pages were created.",
          };
        }
        const missing = [...new Set(pages.flatMap(({ sourceIds }) => sourceIds))].filter((id) => {
          const evidence = wikiFreshSources.get(id);
          if (!evidence) return true;
          const current = stepMessages.findLast((value) => (value as { role?: unknown })?.role === "assistant") as
            | { content?: Array<{ type?: unknown; toolCallId?: unknown }> }
            | undefined;
          if (
            Array.isArray(current?.content) &&
            current.content.some((part) => part.type === "tool-call" && part.toolCallId === evidence.toolCallId)
          )
            return true;
          const delivered = toolResultIn(stepMessages, evidence.toolCallId, "read_website_source", true)?.output as
            | { ok?: unknown; result?: unknown }
            | undefined;
          return delivered?.ok !== true || delivered.result !== evidence.result;
        });
        if (missing.length) {
          return {
            ok: false,
            result: `Reread these cited sources with read_website_source action=get and offset=0, then create in the next provider round: ${wikiPlanningContext(missing)}. No pages were created.`,
          };
        }
      }
      if (
        wikiTopicPlanState.topics &&
        shell.name === "manage_wiki_pages" &&
        (executionInput as { pages?: Array<{ kind?: string }> }).pages?.some(({ kind }) => kind === "guide")
      ) {
        const pages = (executionInput as { pages: unknown[] }).pages;
        if (pages.length !== 1 || wikiTopicPlanState.topics.some(({ role }) => role !== "operating_guide")) {
          return {
            ok: false,
            result:
              "Create every remaining offering and foundation before the separate one-page Operating Guide call. No pages were created.",
          };
        }
      }
      const websiteCreate = Boolean(payload.wikiHomepageSetup) && !readOnly;
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
      if (websiteCreate && !(await authorizedWikiCrawlSynthesis(payload))) {
        return {
          ok: false,
          result:
            "Website Knowledge Base setup is no longer available: it needs Knowledge Base create access and this user's recent website import. Nothing was changed.",
        };
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
      const reviewedWikiCreate = Boolean(
        wikiSourceInventory &&
          shell.name === "manage_wiki_pages" &&
          !readOnly &&
          (payload.wikiCrawl?.mode ?? "initial") === "initial",
      );
      if (reviewedWikiCreate) {
        const create = WikiCrawlSynthesisCreateSchema.safeParse(executionInput);
        if (!create.success) {
          return boundedAgentToolFailure(
            {
              result: create.error.issues.map(({ path, message }) => `${path.join(".")}: ${message}`).join("; "),
              failure: serializeInteractorFailure(create.error),
            },
            payload.turnBudget.maxToolResultChars,
          );
        }
        const canonical = await loadWikiSynthesisReviewContext(payload);
        if (!canonical) {
          return wikiSynthesisReviewFailure(
            payload,
            CustomErrorCode.wikiSourceReviewUnavailable,
            [{ path: ["pages"] }],
            "unavailable",
          );
        }
        if (canonical.pending > 0) {
          return wikiSynthesisReviewFailure(
            payload,
            CustomErrorCode.wikiSourceCoverageRequired,
            [{ path: ["pages"] }],
            "validation",
            { remainingSources: canonical.pending },
          );
        }
        const sources = new Map(canonical.sources.map((source) => [source.id, source]));
        if (create.data.pages.some(({ sourceIds }) => sourceIds.some((id) => !sources.has(id))))
          return wikiSynthesisReviewFailure(payload, CustomErrorCode.wikiSourceCitationInvalid, [{ path: ["pages"] }]);
        const unread = [...new Set(create.data.pages.flatMap(({ sourceIds }) => sourceIds))].filter(
          (id) => !canonical.readHashes.includes(sources.get(id)?.contentHash ?? ""),
        );
        if (unread.length > 0) {
          return wikiSynthesisReviewFailure(
            payload,
            CustomErrorCode.wikiSourceCitationUnread,
            [{ path: ["pages"] }],
            "validation",
            { ids: unread.join(", ") },
          );
        }
        const review = prepareWikiSynthesisReview(
          create.data,
          sources,
          canonical.savedPages,
          appLocaleOrDefault(payload.locale),
          payload.turnBudget.maxContextBytes,
        );
        if (!review.ok) {
          return wikiSynthesisReviewFailure(
            payload,
            review.reason === "evidence"
              ? CustomErrorCode.wikiSourceEvidenceInvalid
              : CustomErrorCode.wikiSourceReviewTooLarge,
            review.paths.map((path) => ({ path })),
          );
        }
        const key = JSON.stringify({ spec: review.request.spec, state: review.request.state });
        if (!wikiApprovedReviews.has(key)) {
          if (
            create.data.pages.some(
              ({ title }) => (wikiReviewRejections.get(title) ?? 0) >= WIKI_SYNTHESIS_REVIEW_MAX_REJECTIONS,
            )
          ) {
            providerStop = "turn_error";
            return wikiSynthesisReviewFailure(payload, CustomErrorCode.wikiSourceReviewLimit, [{ path: ["pages"] }]);
          }
          if (!(await canStartNextHostedAiProviderRound(payload))) {
            hostedAiStop = true;
            return wikiSynthesisReviewFailure(
              payload,
              CustomErrorCode.wikiSourceReviewUnavailable,
              [{ path: ["pages"] }],
              "unavailable",
            );
          }
          const reviewReservation = classifierReservationMicrocents(review.request.spec, review.request.state);
          const requiredMicrocents =
            accruedCostMicrocents() +
            (unreportedProviderRounds + 1) * payload.turnBudget.roundReserveMicrocents +
            reviewReservation;
          if (!(await ensureReservation(requiredMicrocents))) {
            return wikiSynthesisReviewFailure(
              payload,
              CustomErrorCode.wikiSourceReviewUnavailable,
              [{ path: ["pages"] }],
              "unavailable",
            );
          }
          cancelled = await readCancellation(payload);
          if (cancelled || !(await canStartNextHostedAiProviderRound(payload))) {
            if (!cancelled) hostedAiStop = true;
            return wikiSynthesisReviewFailure(
              payload,
              CustomErrorCode.wikiSourceReviewUnavailable,
              [{ path: ["pages"] }],
              "unavailable",
            );
          }
          const evaluated = await executeWikiSynthesisReview(payload, review.request);
          recordWikiSynthesisReviewCharge(auxiliaryCharges, wikiReviewChargeIndices, evaluated);
          const decision = wikiSynthesisReviewDecision(review.request, evaluated.result);
          if (decision.kind === "unavailable") {
            providerStop = "provider_error";
            return wikiSynthesisReviewFailure(
              payload,
              CustomErrorCode.wikiSourceReviewUnavailable,
              [{ path: ["pages"] }],
              "unavailable",
            );
          }
          if (decision.kind === "rejected") {
            for (const title of new Set(decision.issues.map(({ pageTitle }) => pageTitle)))
              wikiReviewRejections.set(title, (wikiReviewRejections.get(title) ?? 0) + 1);
            if ([...wikiReviewRejections.values()].some((count) => count >= WIKI_SYNTHESIS_REVIEW_MAX_REJECTIONS))
              providerStop = "turn_error";
            const retained = wikiSynthesisCreationRepair(
              create.data,
              review.request,
              evaluated.result,
              payload.turnBudget.maxContextBytes,
            );
            if (retained.kind === "size") {
              providerStop = "turn_error";
              return wikiSynthesisReviewFailure(payload, CustomErrorCode.wikiSourceReviewTooLarge, decision.issues);
            }
            if (retained.kind === "retained") wikiCreationRepair = retained.repair;
            else {
              roundFailure ??= toWorkflowFailure(
                new Error(
                  "Rejected website creation repair checkpoint does not match its canonical candidate and review.",
                ),
              );
            }
            return wikiSynthesisReviewFailure(payload, CustomErrorCode.wikiSourceClaimsUnsupported, decision.issues);
          }
          wikiApprovedReviews.add(key);
        }
        cancelled = await readCancellation(payload);
        if (cancelled || !(await canStartNextHostedAiProviderRound(payload))) {
          if (!cancelled) hostedAiStop = true;
          return wikiSynthesisReviewFailure(
            payload,
            CustomErrorCode.wikiSourceReviewUnavailable,
            [{ path: ["pages"] }],
            "unavailable",
          );
        }
      }
      const executed = await executeAgentTool(
        payload,
        shell.name,
        toolCallId,
        executionInput,
        grants.get(toolCallId) ?? "not-required",
        reviewedWikiCreate,
      );
      auxiliaryCharges.push(...executed.classifierCharges);
      retrievalTimings.push(...(executed.retrievalTimings ?? []));
      let outcome = executed.output;
      let wikiPlanRepairOutcome: unknown = null;
      if (
        wikiSourceInventory &&
        payload.wikiHomepageSetup &&
        (payload.wikiCrawl?.mode ?? "initial") === "initial" &&
        shell.name === "read_website_source" &&
        (executionInput as ReadWebsiteSourceInput).action === "plan" &&
        isSuccessfulToolOutcome(outcome) &&
        (executionInput as ReadWebsiteSourceInput).excluded?.some(({ basis }) => basis === "overlap")
      ) {
        outcome = await (async () => {
          const canonical = await loadWikiSynthesisReviewContext(payload);
          if (!canonical) {
            return wikiSynthesisReviewFailure(
              payload,
              CustomErrorCode.wikiSourceReviewUnavailable,
              [{ path: ["excluded"] }],
              "unavailable",
            );
          }
          if (canonical.pending > 0) {
            return wikiSynthesisReviewFailure(
              payload,
              CustomErrorCode.wikiSourceCoverageRequired,
              [{ path: ["excluded"] }],
              "validation",
              { remainingSources: canonical.pending },
            );
          }
          const prepared = prepareWikiSourcePlanReviews(
            executionInput as ReadWebsiteSourceInput,
            new Map(canonical.sources.map((source) => [source.id, source])),
            appLocaleOrDefault(payload.locale),
            payload.turnBudget.maxContextBytes,
          );
          if (!prepared.ok) {
            return wikiSynthesisReviewFailure(
              payload,
              prepared.reason === "evidence"
                ? CustomErrorCode.wikiSourceExclusionEvidenceInvalid
                : CustomErrorCode.wikiSourceReviewTooLarge,
              prepared.paths.map((path) => ({
                path,
                values: {
                  sourceId: (executionInput as ReadWebsiteSourceInput).excluded?.[Number(path[1])]?.sourceIds[0] ?? "",
                },
              })),
            );
          }
          if (wikiPlanReviewRejections >= WIKI_SYNTHESIS_REVIEW_MAX_REJECTIONS) {
            providerStop = "turn_error";
            return wikiSynthesisReviewFailure(payload, CustomErrorCode.wikiSourceReviewLimit, [{ path: ["excluded"] }]);
          }
          const rejected: Array<{ path: Array<string | number>; pageTitle: string; decision: string }> = [];
          for (const request of prepared.requests) {
            const key = JSON.stringify({ spec: request.spec, state: request.state });
            if (wikiApprovedReviews.has(key)) continue;
            if (!(await canStartNextHostedAiProviderRound(payload))) {
              hostedAiStop = true;
              return wikiSynthesisReviewFailure(
                payload,
                CustomErrorCode.wikiSourceReviewUnavailable,
                request.locations,
                "unavailable",
              );
            }
            const requiredMicrocents =
              accruedCostMicrocents() +
              (unreportedProviderRounds + 1) * payload.turnBudget.roundReserveMicrocents +
              classifierReservationMicrocents(request.spec, request.state);
            if (!(await ensureReservation(requiredMicrocents))) {
              return wikiSynthesisReviewFailure(
                payload,
                CustomErrorCode.wikiSourceReviewUnavailable,
                request.locations,
                "unavailable",
              );
            }
            cancelled = await readCancellation(payload);
            if (cancelled || !(await canStartNextHostedAiProviderRound(payload))) {
              if (!cancelled) hostedAiStop = true;
              return wikiSynthesisReviewFailure(
                payload,
                CustomErrorCode.wikiSourceReviewUnavailable,
                request.locations,
                "unavailable",
              );
            }
            const evaluated = await executeWikiSynthesisReview(payload, request);
            recordWikiSynthesisReviewCharge(auxiliaryCharges, wikiReviewChargeIndices, evaluated);
            const decision = wikiSynthesisReviewDecision(request, evaluated.result);
            if (decision.kind === "unavailable") {
              providerStop = "provider_error";
              return wikiSynthesisReviewFailure(
                payload,
                CustomErrorCode.wikiSourceReviewUnavailable,
                request.locations,
                "unavailable",
              );
            }
            if (decision.kind === "rejected") rejected.push(...decision.issues);
            else wikiApprovedReviews.add(key);
          }
          if (rejected.length) {
            wikiPlanReviewRejections += 1;
            if (wikiPlanReviewRejections >= WIKI_SYNTHESIS_REVIEW_MAX_REJECTIONS) providerStop = "turn_error";
            const plan = executionInput as ReadWebsiteSourceInput;
            wikiPlanRepairOutcome = {
              ok: false,
              reviewScope: "whole_sources",
              result:
                "Repair all reported substantive overlap failures before a paid resubmission. Exact matching quotations do not establish whole-source coverage; retain every distinct scope and case in the topic plan.",
              failure: {
                kind: "validation",
                issues: rejected.map(({ path }) => ({
                  code: "custom",
                  path: [...path],
                  message: "",
                  customCode: CustomErrorCode.wikiSourceExclusionOverlapInvalid,
                })),
              },
            };
            return wikiSynthesisReviewFailure(
              payload,
              CustomErrorCode.wikiSourceExclusionOverlapInvalid,
              rejected.map((issue) => ({
                ...issue,
                values: {
                  sourceId: plan.excluded?.[Number(issue.path[1])]?.sourceIds[0] ?? "",
                  coveredByTitle: issue.pageTitle,
                },
              })),
            );
          }
          cancelled = await readCancellation(payload);
          if (cancelled || !(await canStartNextHostedAiProviderRound(payload))) {
            if (!cancelled) hostedAiStop = true;
            return wikiSynthesisReviewFailure(
              payload,
              CustomErrorCode.wikiSourceReviewUnavailable,
              [{ path: ["excluded"] }],
              "unavailable",
            );
          }
          return outcome;
        })();
      }
      if (wikiSourceInventory && shell.name === "read_website_source") {
        if (repairRead && !repairRead.replayed)
          wikiPlanRepairReads = wikiSourcePlanRepairReadComplete(wikiPlanRepairReads, executionInput, outcome);
        retainWikiPlanRepair(executionInput, wikiPlanRepairOutcome ?? outcome);
        outcome = wikiSourcePlanReadOutcome(executionInput, outcome, wikiTopicPlanState.topics !== null);
      }
      if (wikiSourceInventory) {
        const mergedCandidates = wikiMergeOfferingCandidates(
          wikiTopicPlanState.candidates,
          wikiPlanningCandidates(executionInput, outcome, wikiSourceInventory),
        );
        if (mergedCandidates.length > WIKI_SYNTHESIS_MAX_PAGES) {
          const refusal = wikiSourcePlanRefusal(
            "Too many unresolved offering candidates for the sixteen-page import. Complete a supported plan or explicitly reclassify candidates with fresh evidence before adding more topics; no plan was accepted.",
            payload.turnBudget.maxToolResultChars,
          );
          retainWikiPlanRepair(executionInput, refusal);
          return refusal;
        }
        wikiTopicPlanState.candidates = mergedCandidates;
        if (wikiTopicPlanState.candidates.length && wikiTopicPlanState.topics === null)
          wikiContinuationPrompt = `Offering planning hypotheses, never factual evidence: ${wikiPlanningContext(wikiTopicPlanState.candidates)}. Finish reading all sources, then retain each distinct offering or explicitly reclassify each source with an exact evidence quote. Repair omissions without discarding recognized offerings.`;
      }
      if (wikiSourceInventory && isSuccessfulToolOutcome(outcome)) {
        if (shell.name === "read_website_source") {
          const evidence = wikiReadSourceEvidence(executionInput, outcome);
          if (evidence) {
            wikiFreshSources.set(evidence.sourceId, {
              toolCallId,
              result: evidence.result,
            });
          }
        }
        if (shell.name === "read_website_source" && wikiTopicPlanState.topics === null) {
          const plan = executionInput as ReadWebsiteSourceInput;
          if (plan.action === "plan" && plan.topics) {
            wikiPlanRepair = null;
            wikiPlanRepairReads = null;
            wikiPlanRepairReadRefusals = 0;
            wikiTopicPlanState.topics = plan.topics;
            wikiTopicPlanState.candidates = [];
            wikiTopicPlanState.omittedFoundations = plan.omittedFoundations ?? [];
          }
        } else if (shell.name === "manage_wiki_pages" && wikiTopicPlanState.topics) {
          const pages =
            (
              executionInput as {
                pages?: Array<{
                  title: string;
                  kind: string;
                  sourceIds: string[];
                }>;
              }
            ).pages ?? [];
          wikiTopicPlanState.topics = wikiTopicPlanState.topics.filter(
            (topic) => !pages.some((page) => wikiPageMatchesTopic(topic, page)),
          );
          for (const sourceId of pages.flatMap(({ sourceIds }) => sourceIds)) wikiFreshSources.delete(sourceId);
          if (
            wikiCreationRepair?.draft.pages.every((rejected) =>
              pages.some(
                (page) =>
                  page.title === rejected.title &&
                  page.kind === rejected.kind &&
                  page.sourceIds.length === rejected.sourceIds.length &&
                  rejected.sourceIds.every((sourceId) => page.sourceIds.includes(sourceId)),
              ),
            )
          )
            wikiCreationRepair = null;
        }
        if (wikiTopicPlanState.topics !== null)
          wikiContinuationPrompt = `Server topic-plan progress, never factual evidence: ${JSON.stringify(wikiTopicPlanState).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e")}. Create each remaining exact title using freshly read cited sources. Create supported foundations first, grouping only pages with identical citation-source sets; then complete every offering and procedure, and create the guide last in a separate call. Record unsupported foundation omissions in the guide gaps. An empty topics list means every planned page has been created; do not recreate them.`;
      }
      if (!readOnly && isSuccessfulToolOutcome(outcome)) performedWrite = true;
      return outcome;
    };

    let wikiSynthesisTail: Promise<unknown> = Promise.resolve();
    const runShellTool = (
      shell: AgentToolShell,
      input: unknown,
      toolCallId: string,
      stepMessages: readonly unknown[],
    ) => {
      if (!wikiSourceInventory) return invokeShellTool(shell, input, toolCallId, stepMessages);
      const execution = wikiSynthesisTail.then(() => invokeShellTool(shell, input, toolCallId, stepMessages));
      wikiSynthesisTail = execution.then(
        () => undefined,
        () => undefined,
      );
      return execution;
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

    const webSearchAffordable = async () => {
      const remaining = webSearchCallLimit - webSearchCalls;
      if (remaining < 1) return false;
      const requiredMicrocents =
        accruedCostMicrocents() +
        payload.turnBudget.roundReserveMicrocents +
        agentWebSearchReserveMicrocents(remaining);
      if (requiredMicrocents <= reservedMicrocents) return true;
      const extension = await ensureTurnReservation(payload, requiredMicrocents);
      if (extension.disposition !== "extended") return false;
      reservedMicrocents = extension.reservedMicrocents;
      return true;
    };

    const applyRound = async (step: AgentRoundResult) => {
      appliedThisCall += 1;
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
            ...(part.type === "tool-error" ||
            (isAgentWebTool(part.toolName) && !isSuccessfulAgentWebResult(part.output))
              ? { threw: true as const }
              : { output: part.output }),
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
        webSearchCalls += agentWebSearchCallsInStep(step);
        if (webSearchCalls > webSearchCallLimit) webSearchOvershoot = true;
        const chargeableSearches = agentWebSearchChargeableCallsInStep(step, isSuccessfulAgentWebResult);
        const charge = readAgentProviderCharge(step.providerMetadata, payload.turnBudget.servingProvider);
        const roundCharge = readAgentProviderRoundCharge(step.providerMetadata, payload.turnBudget.servingProvider);
        const gatewayDebitMicrocents = readGatewayCostMicrocents(step.providerMetadata);
        const hasPositiveGatewayDebit = (gatewayDebitMicrocents ?? 0) > 0;
        const hasTokenUsage = Object.values(roundTokens).some((count) => count > 0);
        const remainingReservationMicrocents = Math.max(0, reservedMicrocents - accruedCostMicrocents());
        const estimatedInferenceMicrocents =
          charge.outcome !== "unreadable"
            ? 0
            : !hasPositiveGatewayDebit && !hasTokenUsage
              ? Math.max(1, Math.min(payload.turnBudget.roundReserveMicrocents, remainingReservationMicrocents))
              : computeCostMicrocents(
                  payload.turnBudget.modelSpec,
                  roundTokens,
                  payload.turnBudget.servingProvider,
                  payload.turnBudget.inferenceRegion,
                );
        const provenNotBilled = charge.outcome === "notBilled" && chargeableSearches === 0;
        const standaloneCostMicrocents =
          charge.outcome === "measured"
            ? charge.charge.costMicrocents
            : charge.outcome === "notBilled"
              ? Math.max(gatewayDebitMicrocents ?? 0, chargeableSearches * AGENT_WEB_SEARCH_WORST_CASE_MICROCENTS)
              : Math.max(
                  gatewayDebitMicrocents ?? 0,
                  estimatedInferenceMicrocents +
                    (hasPositiveGatewayDebit ? 0 : chargeableSearches * AGENT_WEB_SEARCH_WORST_CASE_MICROCENTS),
                );

        const roundSearchFallbackMicrocents =
          roundCharge?.currentAttemptOutcome === "notBilled"
            ? chargeableSearches * AGENT_WEB_SEARCH_WORST_CASE_MICROCENTS
            : 0;
        const aggregateCostMicrocents = roundCharge
          ? roundCharge.measured
            ? roundCharge.costMicrocents + roundSearchFallbackMicrocents
            : Math.max(roundCharge.costMicrocents, remainingReservationMicrocents)
          : standaloneCostMicrocents;
        const safeAggregateCost = Number.isSafeInteger(aggregateCostMicrocents);
        const costMicrocents = Math.min(Number.MAX_SAFE_INTEGER, aggregateCostMicrocents);
        const measured = roundCharge
          ? roundCharge.measured && roundSearchFallbackMicrocents === 0 && safeAggregateCost
          : charge.outcome === "measured" || provenNotBilled;
        const unreadableReason = roundCharge
          ? !safeAggregateCost
            ? "the provider reported an unrepresentable aggregate cost"
            : (roundCharge.unreadableReason ??
              (roundSearchFallbackMicrocents > 0
                ? "the gateway reported billed search work without a usable current debit"
                : undefined))
          : charge.outcome === "unreadable"
            ? charge.reason
            : charge.outcome === "notBilled" && !provenNotBilled
              ? "the gateway reported billed search work without a usable total debit"
              : undefined;

        tokens = addTokens(tokens, roundTokens);
        ledger.push({ tokens: roundTokens, costMicrocents, measured, unreadableReason });
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
        let candidateMessages = continueOutput
          ? [
              ...compacted.messages,
              {
                role: "user" as const,
                content: AGENT_OUTPUT_CONTINUATION_PROMPT,
              },
            ]
          : [...compacted.messages];
        if (wikiContinuationPrompt) candidateMessages.push({ role: "user" as const, content: wikiContinuationPrompt });
        if (wikiPlanRepair) candidateMessages.push({ role: "user" as const, content: wikiPlanRepairContext() });
        candidateMessages = withWikiCreationRepair(candidateMessages);
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
          const readingWebsite = Boolean(
            (wikiSourceInventory && wikiTopicPlanState.topics === null) ||
              (payload.wikiCrawl && (await pendingWikiSynthesisSources(payload)) > 0),
          );
          const activeTools = readingWebsite ? ["read_website_source"] : activeToolNamesFor(stepMessages);
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
          if (readingWebsite) {
            const maxRetries = fundedRetryCount();
            return {
              activeTools,
              toolChoice: "required" as const,
              ...(maxRetries < AGENT_MODEL_DEFAULT_MAX_RETRIES ? { maxRetries } : {}),
            };
          }

          if (webSearchOvershoot) {
            return {
              activeTools: activeTools.filter((toolName) => !isAgentWebTool(toolName)),
              toolChoice: "none" as const,
              maxRetries: fundedRetryCount(),
            };
          }
          const webSearchPermitted =
            activeTools.includes(AGENT_WEB_SEARCH_TOOL_NAME) &&
            !(isUnattendedSurface(surface) && performedWrite) &&
            (await webSearchAffordable());
          const maxRetries = webSearchPermitted ? 0 : fundedRetryCount();
          return {
            activeTools: webSearchPermitted ? activeTools : activeTools.filter((toolName) => !isAgentWebTool(toolName)),
            ...(payload.wikiCrawl ? { toolChoice: "auto" as const } : {}),
            ...(payload.webSearchEnabled || maxRetries < AGENT_MODEL_DEFAULT_MAX_RETRIES ? { maxRetries } : {}),
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
          messages = withWikiCreationRepair(
            nextAgentSegmentMessages({
              messages: result.messages,
              finishReason,
              lastStep: continuationSteps.at(-1),
            }),
          );
          continue;
        }
        await reportResolvedProviderError(payload, finishReason, resolvedError, resolvedProviderErrorRetries + 1);
        providerStop = "provider_error";
      }

      if (abandoned) break;
      if (cancelled || budgetStop || hostedAiStop || providerStop !== null || roundFailure !== null) break;

      let pending = pendingApprovalCalls(result.messages);
      if (pending.length === 0) {
        if (finishReason === "stop") {
          const remaining = payload.wikiCrawl ? await pendingWikiSynthesisSources(payload) : 0;
          if (remaining === 0) {
            if (!wikiSourceInventory || (wikiTopicPlanState.topics !== null && wikiTopicPlanState.topics.length === 0))
              break;
            if (wikiTopicReminders >= 2) {
              roundFailure = toWorkflowFailure(
                new Error("Website synthesis stopped before its topic plan was completed."),
              );
              break;
            }
            if (!(await ensureReservation(accruedCostMicrocents() + payload.turnBudget.roundReserveMicrocents))) break;
            wikiTopicReminders += 1;
            wikiContinuationPrompt =
              wikiTopicPlanState.topics === null
                ? `Website setup still needs a source topic plan. Call read_website_source action=plan, accounting for every source in topics or source-specific exclusions, never both, and every supported page role. Retain recognized offering candidates: ${wikiPlanningContext(wikiTopicPlanState.candidates)}; explicitly reclassify each source with an exact evidence quote if unsupported. Distinct dedicated offerings and technical capabilities require their own topics. Routing category does not determine relevance. Never claim completion before the plan and its pages are complete.`
                : `Website setup still has planned topics to create: ${JSON.stringify(wikiTopicPlanState).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e")}. Reread their cited sources and create each exact planned title before claiming completion: supported foundations first, grouping only pages with identical citation-source sets, then every offering and procedure, and the guide last in a separate call. Record unsupported foundations in the guide gaps. Do not invent facts or recreate completed topics.`;
            messages = withWikiCreationRepair([
              ...nextAgentSegmentMessages({
                messages: result.messages,
                finishReason,
                lastStep: continuationSteps.at(-1),
              }),
              {
                role: "user" as const,
                content: wikiContinuationPrompt,
              },
              ...(wikiPlanRepair ? [{ role: "user" as const, content: wikiPlanRepairContext() }] : []),
            ]);
            continue;
          }
          if (wikiCoverageReminders >= 2) {
            roundFailure = toWorkflowFailure(
              new Error("Website synthesis stopped before stored evidence was fully read."),
            );
            break;
          }
          if (!(await ensureReservation(accruedCostMicrocents() + payload.turnBudget.roundReserveMicrocents))) break;
          wikiCoverageReminders += 1;
          wikiContinuationPrompt = `The website import is incomplete: ${remaining} stored source groups still have unread text. Continue read_website_source action=next until remainingSources is zero, then create evidence-based pages for all supported distinct topics. Do not claim completion or pad the page count. Retain these offering planning hypotheses, never factual evidence: ${wikiPlanningContext(wikiTopicPlanState.candidates)}.`;
          messages = withWikiCreationRepair([
            ...nextAgentSegmentMessages({
              messages: result.messages,
              finishReason,
              lastStep: continuationSteps.at(-1),
            }),
            {
              role: "user" as const,
              content: wikiContinuationPrompt,
            },
            ...(wikiPlanRepair ? [{ role: "user" as const, content: wikiPlanRepairContext() }] : []),
          ]);
          continue;
        }
        if (cancelled || budgetStop || providerStop !== null || roundFailure !== null) break;

        const carried = withWikiCreationRepair(
          nextAgentSegmentMessages({
            messages: result.messages,
            finishReason,
            lastStep: continuationSteps.at(-1),
          }),
        );
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
        messages = withWikiCreationRepair(resumableMessages);
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
          messages = withWikiCreationRepair(resumableMessages);
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
      messages = withWikiCreationRepair(withApprovalResponses(resumableMessages, outcomes, surface));
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
    } else if (!payload.wikiHomepageSetup && webSources.size > 0 && transcript.replyText.trim()) {
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
