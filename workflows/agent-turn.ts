import type { Prisma } from "@/generated/prisma";
import type { AgentToolDeps } from "@/ee/agent-chat/agent-tools";
import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { AgentActivityResource } from "@/ee/agent-chat/agent-activity";
import type { AgentTranscriptEvent } from "@/ee/agent-chat/agent-turn-transcript";
import type { ReplayMessage } from "@/ee/agent-chat/agent-stream-utils";
import type { TokenCounts } from "@/ee/agent-chat/model-pricing";
import type { WorkflowTenant } from "./workflow-tenant";

import { WorkflowAgent } from "@ai-sdk/workflow";
import { createHook, getWritable, sleep } from "workflow";
import { isStepCount, jsonSchema } from "ai";

import { AgentTurnTranscript } from "@/ee/agent-chat/agent-turn-transcript";
import {
  agentApprovalHookToken,
  agentApprovalRequestId,
  pendingApprovalCalls,
  toolApprovalDecisionForGrant,
  withApprovalResponses,
  type AgentApprovalOutcome,
  type ToolApprovalGrant,
} from "@/ee/agent-chat/agent-approval-resume";
import { buildAgentProviderContext } from "@/ee/agent-chat/agent-provider-context";
import { buildAgentSystemPrompt } from "@/ee/agent-chat/system-prompt";
import { buildTurnUsageSettlement, usageToTokenCounts } from "@/ee/agent-chat/llm.service";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";
import { createAgentSupportTicket } from "@/ee/agent-chat/agent-runner";
import { describeAgentTool } from "@/ee/agent-chat/agent-activity";
import { isAgentToolCancellation } from "@/ee/agent-chat/agent-tool-cancellation";
import { getAgentChatRepo } from "@/core/di";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { requiresApproval } from "@/ee/agent-chat/gated-tools";
import { resolveAgentApprovalContext } from "@/ee/agent-chat/agent-external-approval-context";
import { resolveAgentToolResultMaxChars } from "@/ee/agent-chat/agent-budget-policy";
import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { runInTransaction } from "@/core/decorators/transaction-runner";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "agent-turn";

export const AGENT_DURABLE_APPROVAL_WINDOW_MS = 30 * 60 * 1000;

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
  approvalWindowMs?: number;
  tenant: WorkflowTenant;
};

type AgentToolShell = {
  name: string;
  description: string | undefined;
  inputSchema: unknown;
  annotations: Record<string, boolean> | undefined;
  gated: boolean;
};

type PendingApproval = { requestId: string; toolCallId: string; toolName: string; input: unknown };

type AgentRoundResult = {
  content: unknown[];
  finishReason: string;
  usage: Parameters<typeof usageToTokenCounts>[0] & { outputTokenDetails?: { reasoningTokens?: number } };
  providerMetadata: Parameters<typeof readAgentProviderCharge>[0];
};

type RoundLedgerEntry = { tokens: TokenCounts; costMicrocents: number; measured: boolean; unreadableReason?: string };

function emptyTokens(): TokenCounts {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}

function addTokens(left: TokenCounts, right: TokenCounts): TokenCounts {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
  };
}

function isStructuredToolFailure(output: unknown) {
  return Boolean(output && typeof output === "object" && (output as { ok?: unknown }).ok === false);
}

function backgroundToolDeps(payload: AgentTurnWorkflowPayload, grant: ToolApprovalGrant): AgentToolDeps {
  const repo = getAgentChatRepo();

  return {
    resultMaxChars: resolveAgentToolResultMaxChars(payload.turnBudget.maxToolResultChars),
    runInCallerContext: (run) => runAsBackgroundTenant(payload.userId, run),
    resolveApprovalContext: resolveAgentApprovalContext,
    requestApproval: () => Promise.resolve(toolApprovalDecisionForGrant(grant)),
    runUiCommand: () =>
      Promise.resolve({ ok: false, result: "Interface control is only available while the panel is open." }),
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

async function openTurn(payload: AgentTurnWorkflowPayload): Promise<void> {
  "use step";
  await runAsBackgroundTenant(payload.userId, () =>
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
    { execute?: (input: unknown, options: { toolCallId: string; messages: [] }) => Promise<unknown> }
  >;
  const execute = tools[toolName]?.execute;
  if (!execute) throw new Error(`Agent tool ${toolName} has no executable implementation.`);

  return execute(input, { toolCallId, messages: [] });
}
executeAgentTool.maxRetries = 0;

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
): Promise<void> {
  "use step";
  const repo = getAgentChatRepo();

  await runAsBackgroundTenant(payload.userId, async () => {
    await repo.heartbeatAgentRunUnscoped({
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

async function finalizeTurn(
  payload: AgentTurnWorkflowPayload,
  outcome: {
    parts: unknown;
    terminalCode: "completed" | "partial";
    affectedResources: AgentActivityResource[];
    tokens: TokenCounts;
    ledger: RoundLedgerEntry[];
  },
): Promise<void> {
  "use step";
  const measured = outcome.ledger.every((entry) => entry.measured);
  const unreadableReason = outcome.ledger.find((entry) => entry.unreadableReason)?.unreadableReason ?? null;

  await runAsBackgroundTenant(payload.userId, () =>
    getAgentChatRepo().finalizeAgentTurnOrThrowUnscoped({
      turnRequestId: payload.turnRequestId,
      conversationId: payload.conversationId,
      companyId: payload.companyId,
      userId: payload.userId,
      runId: payload.runId,
      parts: outcome.parts as Prisma.InputJsonValue,
      terminalCode: outcome.terminalCode,
      affectedResources: outcome.affectedResources,
      usageSettlement: buildTurnUsageSettlement(payload.turnBudget.modelSpec, outcome.tokens, {
        provider: payload.turnBudget.servingProvider,
        reservedCredits: payload.turnBudget.reservedCredits,
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
}
finalizeTurn.maxRetries = 0;

export async function runAgentTurn(payload: AgentTurnWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    await openTurn(payload);
    const shells = await loadAgentToolShells();
    const writable = getWritable();

    const queued: AgentTranscriptEvent[] = [];
    const transcript = new AgentTurnTranscript((event) => {
      if (event.type !== "delta") queued.push(event);
    });

    const systemPrompt = buildAgentSystemPrompt({
      userName: payload.userName,
      appBaseUrl: payload.appBaseUrl,
      locale: payload.locale,
    });
    const providerContext = buildAgentProviderContext(systemPrompt, payload.messages, []);

    let tokens = emptyTokens();
    let roundIndex = 0;
    let appliedThisCall = 0;
    let finishReason = "unknown";
    const ledger: RoundLedgerEntry[] = [];
    const grants = new Map<string, ToolApprovalGrant>();
    const completedTools: ({ toolCallId: string; toolName: string } & ({ output: unknown } | { threw: true }))[] = [];

    const settledToolCallIds = new Set<string>();

    const settleToolOutcome = (toolCallId: string, toolName: string | undefined, output: unknown) => {
      if (settledToolCallIds.has(toolCallId)) return;
      settledToolCallIds.add(toolCallId);

      const cancelled = isAgentToolCancellation(output);
      const failed = !cancelled && isStructuredToolFailure(output);
      transcript.completeToolCall({
        toolCallId,
        toolName,
        status: cancelled ? "cancelled" : failed ? "error" : "done",
        failed,
      });
    };

    const applyRound = async (step: AgentRoundResult) => {
      appliedThisCall += 1;

      for (const raw of step.content) {
        const part = raw as { type?: string; text?: string; toolCallId?: string; toolName?: string; input?: unknown };
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

      for (const completed of completedTools.splice(0)) {
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

      await persistRound(payload, {
        roundIndex: roundIndex++,
        parts: step.content,
        finishReason: step.finishReason,
        tokens: roundTokens,
        reasoningTokens: step.usage.outputTokenDetails?.reasoningTokens ?? 0,
        costMicrocents,
      });
      await publishTranscriptEvents(queued.splice(0));
    };

    let messages = providerContext.messages;

    for (;;) {
      const agent = new WorkflowAgent({
        id: WORKFLOW_NAME,
        model: payload.turnBudget.modelSpec,
        instructions: systemPrompt,
        tools: Object.fromEntries(
          shells.map((shell) => [
            shell.name,
            {
              description: shell.description,
              inputSchema: jsonSchema(shell.inputSchema as never),
              needsApproval: shell.gated
                ? (input: unknown) =>
                    requiresApproval(internalToolIdentity(shell.name), { annotations: shell.annotations }, input)
                : false,
              execute: (input: unknown, options: { toolCallId: string }) =>
                executeAgentTool(
                  payload,
                  shell.name,
                  options.toolCallId,
                  input,
                  grants.get(options.toolCallId) ?? "not-required",
                ),
            },
          ]),
        ),
        maxOutputTokens: payload.turnBudget.maxOutputTokens,
        providerOptions: {
          gateway: { only: [payload.turnBudget.servingProvider] },
          openai: { parallelToolCalls: false },
        },
        stopWhen: isStepCount(payload.turnBudget.maxSteps),
        onToolExecutionEnd: (event) => {
          completedTools.push(
            event.success
              ? { toolCallId: event.toolCall.toolCallId, toolName: event.toolCall.toolName, output: event.output }
              : { toolCallId: event.toolCall.toolCallId, toolName: event.toolCall.toolName, threw: true },
          );
        },
        onStepEnd: (step) => applyRound(step as unknown as AgentRoundResult),
      });

      appliedThisCall = 0;
      const result = await agent.stream({ messages, writable, preventClose: true, sendFinish: false });
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

      const pending = pendingApprovalCalls(result.messages);
      if (pending.length === 0) break;

      const requests: PendingApproval[] = pending.map((call) => ({
        requestId: agentApprovalRequestId(payload.turnRequestId, call.toolCallId),
        toolCallId: call.toolCallId,
        toolName: call.toolName,
        input: call.input,
      }));

      const approvalWindowMs = payload.approvalWindowMs ?? AGENT_DURABLE_APPROVAL_WINDOW_MS;
      await openApprovalRequests(payload, requests, approvalWindowMs);
      for (const request of requests) {
        transcript.beginApproval(
          request.requestId,
          describeAgentTool(internalToolIdentity(request.toolName), request.input),
        );
      }
      await publishTranscriptEvents(queued.splice(0));

      const hook = createHook<{ requestId: string }>({ token: agentApprovalHookToken(payload.conversationId) });
      await Promise.race([
        (async () => {
          await hook;
        })(),
        sleep(approvalWindowMs),
      ]);
      hook.dispose();

      const outcomes = await readApprovalDecisions(payload, requests);
      for (const outcome of outcomes) {
        const request = requests.find((candidate) => candidate.toolCallId === outcome.toolCallId);
        if (!request) continue;
        grants.set(outcome.toolCallId, outcome.decision === "approve" ? "approve" : "not-required");
        transcript.resolveApproval(
          request.requestId,
          outcome.decision === "approve" ? "approved" : outcome.decision === "reject" ? "rejected" : "timeout",
          outcome.decision,
        );
        if (outcome.decision !== "approve") {
          settledToolCallIds.add(outcome.toolCallId);
          transcript.completeToolCall({ toolCallId: outcome.toolCallId, status: "cancelled", failed: false });
        }
      }
      await publishTranscriptEvents(queued.splice(0));

      messages = withApprovalResponses(result.messages, outcomes);
    }

    transcript.finishTextSegment();
    transcript.failUnfinishedTools("error", true);
    if (transcript.replyParts.length === 0) transcript.appendText(" ");
    await publishTranscriptEvents(queued.splice(0));
    await closeTurnStream();

    await finalizeTurn(payload, {
      parts: transcript.replyParts,
      terminalCode: finishReason === "stop" ? "completed" : "partial",
      affectedResources: transcript.affectedResources,
      tokens,
      ledger,
    });
  } catch (error) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
