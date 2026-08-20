import { randomUUID } from "node:crypto";
import type { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { type Validated } from "@/core/validation/validation.utils";
import { env } from "@/env";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { resolveUserLocale } from "@/i18n/user-locale";

import {
  SendAgentMessageSchema,
  clientSafeAgentMessageParts,
  hasRenderableAgentMessageParts,
  type AgentMessagePart,
  type SendAgentMessageData,
  partsToText,
} from "./agent-chat.schema";
import type { AgentRunContext } from "./agent-runner";
import type { AgentUsageService } from "./agent-usage.service";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { AGENT_RUN_LEASE_MS, decideAgentTurnAdmission, type AgentTurnRequestSnapshot } from "./agent-turn-request";
import { laneModelId } from "./llm.service";
import { buildAgentSystemPrompt } from "./system-prompt";
import { getAgentAiToolDefinitions, selectAgentToolNames } from "./agent-tools";
import {
  AGENT_REPLAY_COUNT,
  AGENT_REPLAY_MAX_CHARS,
  conservativeAgentInitialContextBytes,
} from "./agent-provider-context";
import { sanitizeAgentConversationTitle } from "./agent-output-safety";
import { createAgentLimitExceededError } from "./agent-errors";

type AdmittedAgentRun = { disposition: "run" } & Omit<AgentRunContext, "appBaseUrl">;

export type SendAgentMessageResult =
  | AdmittedAgentRun
  | {
      disposition: "completedReplay";
      conversationId: string;
      userMessageId: string;
      clientRequestId: string;
      assistantMessage: {
        id: string;
        parts: AgentMessagePart[];
        createdAt: Date;
      };
      terminalCode: NonNullable<AgentTurnRequestSnapshot["terminalCode"]>;
      affectedResources: AgentTurnRequestSnapshot["affectedResources"];
    }
  | {
      disposition: "running" | "failed" | "uncertain" | "conflict";
      clientRequestId: string;
      conversationId?: string;
      userMessageId?: string;
      retryAllowed: boolean;
    };

@AllowInDemoMode
@TenantInteractor()
export class SendAgentMessageInteractor extends AuthenticatedInteractor<SendAgentMessageData, SendAgentMessageResult> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private usageService: AgentUsageService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({ input: SendAgentMessageSchema, precheck: (self, _data, ctx) => self.precheckEntitlement(ctx) })
  async invoke(data: SendAgentMessageData): Validated<SendAgentMessageResult> {
    const user = getTenantUser();
    const now = new Date();
    const model = laneModelId("agent");
    await this.repo.normalizeExpiredAgentRunLease(now, model);

    const replay = await this.repo.findAgentTurnRequestForAdmission(data.clientRequestId, now, model);
    const pageRoute = data.pageContext?.route ?? null;
    const decision = decideAgentTurnAdmission(replay?.snapshot ?? null, {
      clientRequestId: data.clientRequestId,
      conversationId: data.conversationId,
      text: data.text,
      pageRoute,
      retry: data.retry,
    });

    if (decision.disposition === "completed") {
      const assistantMessage = replay?.assistantMessage;
      const terminalCode = decision.turn.terminalCode;
      const safeParts = assistantMessage
        ? clientSafeAgentMessageParts(assistantMessage.parts, {
            sanitizeText: true,
          })
        : [];
      if (!assistantMessage || !terminalCode || !hasRenderableAgentMessageParts(safeParts)) {
        return {
          ok: true as const,
          data: {
            disposition: "uncertain",
            clientRequestId: data.clientRequestId,
            conversationId: decision.turn.conversationId,
            userMessageId: decision.turn.userMessageId,
            retryAllowed: false,
          },
        };
      }

      return {
        ok: true as const,
        data: {
          disposition: "completedReplay",
          conversationId: decision.turn.conversationId,
          userMessageId: decision.turn.userMessageId,
          clientRequestId: data.clientRequestId,
          assistantMessage: {
            id: assistantMessage.id,
            parts: safeParts,
            createdAt: assistantMessage.createdAt,
          },
          terminalCode,
          affectedResources: decision.turn.affectedResources,
        },
      };
    }

    if (
      decision.disposition === "running" ||
      decision.disposition === "failed" ||
      decision.disposition === "uncertain"
    ) {
      return {
        ok: true as const,
        data: {
          disposition: decision.disposition,
          clientRequestId: data.clientRequestId,
          conversationId: decision.turn.conversationId,
          userMessageId: decision.turn.userMessageId,
          retryAllowed: decision.disposition === "failed",
        },
      };
    }

    if (decision.disposition === "conflict") {
      return {
        ok: true as const,
        data: {
          disposition: "conflict",
          clientRequestId: data.clientRequestId,
          retryAllowed: false,
        },
      };
    }

    let conversation =
      decision.disposition === "retry"
        ? await this.repo.findConversation(decision.turn.conversationId)
        : data.conversationId
          ? await this.repo.findConversation(data.conversationId)
          : null;
    if ((decision.disposition === "retry" || data.conversationId) && !conversation)
      throw new Error("Conversation not found.");

    const userName = `${user.firstName} ${user.lastName}`.trim();
    const locale = data.locale ?? resolveUserLocale(user);
    const priorUserTexts = conversation
      ? (await this.repo.listRecentMessages(conversation.id, AGENT_REPLAY_COUNT))
          .filter((message) => message.role === "user")
          .map((message) => partsToText(message.parts))
          .filter(Boolean)
      : [];
    const toolNames = selectAgentToolNames({ text: data.text, pageRoute, priorUserTexts });
    const requiredContextBytes = conservativeAgentInitialContextBytes({
      systemPrompt: buildAgentSystemPrompt({
        userName,
        appBaseUrl: env.BASE_URL,
        locale,
      }),
      currentText: data.text,
      pageRoute,
      toolDefinitions: getAgentAiToolDefinitions(toolNames),
    });
    if (requiredContextBytes === null) throw new Error("The Assistant request context could not be measured safely.");

    const creditAdmission = await this.usageService.prepareTurn(user.id, now, requiredContextBytes);
    if (!creditAdmission.reservation) throw createAgentLimitExceededError();

    const runId = randomUUID();
    const claimed = await this.repo.claimAgentRunLease(runId, new Date(now.getTime() + AGENT_RUN_LEASE_MS));
    if (!claimed) throw new Error("Another assistant turn is already running.");
    let reservationCreated = false;
    try {
      await this.usageService.reserveUsage({
        reservationId: runId,
        companyId: user.companyId,
        userId: user.id,
        reservation: creditAdmission.reservation,
      });
      reservationCreated = true;

      conversation ??= await this.repo.createConversation({
        title: sanitizeAgentConversationTitle(data.text),
      });
      const turnRequestId = decision.disposition === "retry" ? decision.turn.id : randomUUID();
      const userMessageId = decision.disposition === "retry" ? decision.turn.userMessageId : randomUUID();
      if (decision.disposition === "retry") {
        const retried = await this.repo.retryAgentTurnRequest({
          turnRequestId,
          priorRunId: decision.turn.runId,
          priorAttemptCount: decision.turn.attemptCount,
          runId,
        });
        if (!retried) throw new Error("The assistant retry could not be started.");
      } else {
        await this.repo.createAgentTurnRequest({
          turnRequestId,
          clientRequestId: data.clientRequestId,
          conversationId: conversation.id,
          text: data.text,
          pageRoute,
          runId,
          userMessageId,
        });
      }
      await this.repo.touchConversation(conversation.id);

      const recent = await this.repo.listRecentMessages(conversation.id, AGENT_REPLAY_COUNT);
      const pageContext = data.pageContext ? `<page_context route="${data.pageContext.route}"/>\n` : "";
      const messages = recent
        .map((message) => {
          const text = partsToText(message.parts);
          return {
            role: message.role as string,
            text: message.id === userMessageId ? `${pageContext}${text}` : text.slice(0, AGENT_REPLAY_MAX_CHARS),
          };
        })
        .filter((message) => message.text);

      return {
        ok: true as const,
        data: {
          disposition: "run",
          companyId: user.companyId,
          userId: user.id,
          runId,
          turnRequestId,
          userMessageId,
          clientRequestId: data.clientRequestId,
          userName,
          conversationId: conversation.id,
          locale,
          toolNames,
          messages,
          turnBudget: creditAdmission.reservation.budget,
        },
      };
    } catch (error) {
      await Promise.allSettled([
        ...(reservationCreated
          ? [
              this.usageService.releaseReservation({
                reservationId: runId,
                companyId: user.companyId,
                userId: user.id,
              }),
            ]
          : []),
        this.repo.releaseAgentRunLeaseUnscoped({
          companyId: user.companyId,
          userId: user.id,
          runId,
        }),
      ]);
      throw error;
    }
  }

  private async precheckEntitlement(ctx: z.RefinementCtx) {
    const denied = await this.entitlements.require("agentChat");
    if (!denied) return;

    ctx.addIssue({
      code: "custom",
      message: denied.error.issues[0]?.message ?? "The Assistant is unavailable.",
    });
  }
}
