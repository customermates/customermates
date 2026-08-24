import type { Prisma } from "@/generated/prisma";
import type { AgentTurnBudget } from "@/ee/agent-chat/agent-budget-policy";
import type { ReplayMessage } from "@/ee/agent-chat/agent-stream-utils";
import type { AgentTranscriptEvent } from "@/ee/agent-chat/agent-turn-transcript";
import type { TokenCounts } from "@/ee/agent-chat/model-pricing";
import type { WorkflowTenant } from "./workflow-tenant";

import { WorkflowAgent } from "@ai-sdk/workflow";
import { getWritable } from "workflow";
import { isStepCount } from "ai";

import { runAsBackgroundTenant } from "@/core/decorators/background-tenant";
import { getAgentChatRepo } from "@/core/di";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { describeAgentTool } from "@/ee/agent-chat/agent-activity";
import { buildAgentProviderContext } from "@/ee/agent-chat/agent-provider-context";
import { AgentTurnTranscript } from "@/ee/agent-chat/agent-turn-transcript";
import { buildAgentSystemPrompt } from "@/ee/agent-chat/system-prompt";
import { buildTurnUsageSettlement, usageToTokenCounts } from "@/ee/agent-chat/llm.service";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";
import { getAgentAiTools, isAgentToolCancellation, type AgentToolDeps } from "@/ee/agent-chat/agent-tools";
import { readAgentProviderCharge } from "@/ee/agent-chat/gateway-cost";
import { createAgentSupportTicket } from "@/ee/agent-chat/agent-runner";
import { resolveAgentApprovalContext } from "@/ee/agent-chat/agent-external-approval-context";
import { internalToolIdentity } from "@/ee/agent-chat/tool-identity";
import { resolveAgentToolResultMaxChars } from "@/ee/agent-chat/agent-budget-policy";

import { reportFailure, toWorkflowFailure } from "./capture-failure";

const WORKFLOW_NAME = "agent-turn";

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

function backgroundToolDeps(payload: AgentTurnWorkflowPayload): AgentToolDeps {
  const repo = getAgentChatRepo();

  return {
    resultMaxChars: resolveAgentToolResultMaxChars(payload.turnBudget.maxToolResultChars),
    runInCallerContext: (run) => runAsBackgroundTenant(payload.userId, run),
    resolveApprovalContext: resolveAgentApprovalContext,
    requestApproval: () => Promise.resolve("reject" as const),
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

async function streamTurn(payload: AgentTurnWorkflowPayload): Promise<void> {
  "use step";
  const repo = getAgentChatRepo();
  const writer = getWritable<AgentTranscriptEvent>().getWriter();
  const pending: Promise<void>[] = [];
  const transcript = new AgentTurnTranscript((event) => {
    pending.push(writer.write(event).catch(() => undefined));
  });

  const systemPrompt = buildAgentSystemPrompt({
    userName: payload.userName,
    appBaseUrl: payload.appBaseUrl,
    locale: payload.locale,
  });
  const providerContext = buildAgentProviderContext(systemPrompt, payload.messages, []);

  let tokens = emptyTokens();
  const stepTokens: TokenCounts[] = [];
  let billed = false;
  let measuredCostMicrocents: number | null = null;
  let unreadableReason: string | null = null;
  let roundIndex = 0;
  const completedTools: ({ toolCallId: string; toolName: string } & ({ output: unknown } | { threw: true }))[] = [];

  const agent = new WorkflowAgent({
    id: WORKFLOW_NAME,
    model: payload.turnBudget.modelSpec,
    instructions: systemPrompt,
    tools: getAgentAiTools(backgroundToolDeps(payload)),
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
    onStepEnd: async (step) => {
      for (const raw of step.content) {
        const part = raw as {
          type?: string;
          text?: string;
          toolCallId?: string;
          toolName?: string;
          input?: unknown;
          output?: unknown;
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

      for (const completed of completedTools.splice(0)) {
        if ("threw" in completed) {
          transcript.failToolCall(completed.toolCallId);
          continue;
        }

        const cancelled = isAgentToolCancellation(completed.output);
        const failed = !cancelled && isStructuredToolFailure(completed.output);
        transcript.completeToolCall({
          toolCallId: completed.toolCallId,
          toolName: completed.toolName,
          status: cancelled ? "cancelled" : failed ? "error" : "done",
          failed,
        });
      }

      const roundTokens = usageToTokenCounts(step.usage);
      const charge = readAgentProviderCharge(step.providerMetadata, payload.turnBudget.servingProvider);
      stepTokens.push(roundTokens);
      tokens = addTokens(tokens, roundTokens);
      if (charge.outcome !== "notBilled") billed = true;
      if (charge.outcome === "unreadable") {
        measuredCostMicrocents = null;
        unreadableReason = charge.reason;
      } else if (charge.outcome === "measured" && unreadableReason === null)
        measuredCostMicrocents = (measuredCostMicrocents ?? 0) + charge.charge.costMicrocents;

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
          roundIndex: roundIndex++,
          parts: step.content as unknown as Prisma.InputJsonValue,
          finishReason: step.finishReason,
          ...roundTokens,
          reasoningTokens: step.usage.outputTokenDetails?.reasoningTokens ?? 0,
          costMicrocents:
            charge.outcome === "measured"
              ? charge.charge.costMicrocents
              : computeCostMicrocents(payload.turnBudget.modelSpec, roundTokens, payload.turnBudget.servingProvider),
          modelSpec: payload.turnBudget.modelSpec,
          servingProvider: payload.turnBudget.servingProvider,
        });
      });
    },
  });

  const result = await agent.stream({ messages: providerContext.messages });

  transcript.finishTextSegment();
  transcript.failUnfinishedTools("error", true);
  if (transcript.replyParts.length === 0) transcript.appendText(" ");

  await Promise.all(pending);
  await writer.close().catch(() => undefined);

  await runAsBackgroundTenant(payload.userId, () =>
    repo.finalizeAgentTurnOrThrowUnscoped({
      turnRequestId: payload.turnRequestId,
      conversationId: payload.conversationId,
      companyId: payload.companyId,
      userId: payload.userId,
      runId: payload.runId,
      parts: transcript.replyParts as unknown as Prisma.InputJsonValue,
      terminalCode: result.finishReason === "stop" ? "completed" : "partial",
      affectedResources: transcript.affectedResources,
      usageSettlement: buildTurnUsageSettlement(payload.turnBudget.modelSpec, tokens, {
        provider: payload.turnBudget.servingProvider,
        reservedCredits: payload.turnBudget.reservedCredits,
        providerCharge: { billed, measuredCostMicrocents, stepTokens, unreadableReason },
      }),
    }),
  );
}
streamTurn.maxRetries = 0;

export async function runAgentTurn(payload: AgentTurnWorkflowPayload): Promise<void> {
  "use workflow";
  try {
    await openTurn(payload);
    await streamTurn(payload);
  } catch (error) {
    await reportFailure(WORKFLOW_NAME, toWorkflowFailure(error), payload.tenant);
    throw error;
  }
}
