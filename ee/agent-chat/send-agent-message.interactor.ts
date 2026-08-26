import { randomUUID } from "node:crypto";
import type { z } from "zod";
import * as Sentry from "@sentry/nextjs";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Validated } from "@/core/validation/validation.utils";
import { runInTransaction } from "@/core/decorators/transaction-runner";
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
import type { AgentRunContext } from "./agent-run-context";
import type { AgentUsageService } from "./agent-usage.service";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { AGENT_RUN_LEASE_MS, decideAgentTurnAdmission, type AgentTurnRequestSnapshot } from "./agent-turn-request";
import { buildAgentSystemPrompt } from "./system-prompt";
import { getAgentAiToolDefinitions } from "./agent-tools";
import {
  AGENT_REPLAY_COUNT,
  AGENT_REPLAY_MAX_CHARS,
  conservativeAgentInitialContextBytes,
} from "./agent-provider-context";
import { isAgentModelKey, resolveAgentModel } from "./model-catalog";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import { createInteractorFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

type AdmittedAgentRun = { disposition: "run"; externalRunId: string } & Omit<AgentRunContext, "appBaseUrl">;

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

@TenantInteractor()
export class SendAgentMessageInteractor extends AuthenticatedInteractor<SendAgentMessageData, SendAgentMessageResult> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private usageService: AgentUsageService,
    private entitlements: EntitlementService,
    private backgroundTaskService: BackgroundTaskService,
  ) {
    super();
  }

  @Write({
    input: SendAgentMessageSchema,
    precheck: (self, _data, ctx) => self.precheckEntitlement(ctx),
    tx: false,
  })
  async invoke(data: SendAgentMessageData): Validated<SendAgentMessageResult> {
    const user = this.user;
    const now = new Date();
    const model = resolveAgentModel();
    await this.repo.normalizeExpiredAgentRunLease(now, model.modelId);

    const replay = await this.repo.findAgentTurnRequestForAdmission(data.clientRequestId, now, model.modelId);
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

    const conversation =
      decision.disposition === "retry"
        ? await this.repo.findConversation(decision.turn.conversationId)
        : data.conversationId
          ? await this.repo.findConversation(data.conversationId)
          : null;
    if ((decision.disposition === "retry" || data.conversationId) && !conversation)
      return createInteractorFailure(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

    const requestedModelKey = conversation?.modelKey ?? data.modelKey ?? null;
    if (requestedModelKey !== null && !isAgentModelKey(requestedModelKey))
      return createInteractorFailure(CustomErrorCode.agentModelUnavailable, ["modelKey"]);
    const turnModel = resolveAgentModel(requestedModelKey);

    const userName = `${user.firstName} ${user.lastName}`.trim();
    const locale = data.locale ?? resolveUserLocale(user);
    const requiredContextBytes = conservativeAgentInitialContextBytes({
      systemPrompt: buildAgentSystemPrompt({
        userName,
        appBaseUrl: env.BASE_URL,
        locale,
      }),
      currentText: data.text,
      pageRoute,
      toolDefinitions: getAgentAiToolDefinitions(),
    });
    if (requiredContextBytes === null) throw new Error("The Assistant request context could not be measured safely.");

    const creditAdmission = await this.usageService.prepareTurn(user.id, now, {
      model: turnModel,
      requiredContextBytes,
    });
    const reservation = creditAdmission.reservation;
    if (!reservation) return createInteractorFailure(CustomErrorCode.agentLimitReached);

    const runId = randomUUID();
    const reservationId = randomUUID();
    const conversationId = conversation?.id ?? randomUUID();
    const conversationIsNew = !conversation;
    try {
      const claimed = await runInTransaction(async () => {
        const phaseOneAt = new Date();
        if (conversationIsNew) {
          if (await this.repo.isAtAgentRunLimit(phaseOneAt)) return false;
          await this.repo.createAgentConversationForRun({
            conversationId,
            title: data.text,
            modelKey: requestedModelKey,
            now: phaseOneAt,
          });
        }

        const lease = await this.repo.claimAgentRunLease({
          conversationId,
          runId,
          expiresAt: new Date(phaseOneAt.getTime() + AGENT_RUN_LEASE_MS),
          now: phaseOneAt,
        });
        if (lease !== "claimed") return false;

        await this.usageService.reserveUsage({
          reservationId,
          companyId: user.companyId,
          userId: user.id,
          reservation,
        });
        return true;
      });
      if (!claimed) return createInteractorFailure(CustomErrorCode.agentTurnAlreadyRunning);

      const turnRequestId = decision.disposition === "retry" ? decision.turn.id : randomUUID();
      const userMessageId = decision.disposition === "retry" ? decision.turn.userMessageId : randomUUID();
      const admission = await this.repo.admitAgentTurnOrThrow({
        conversationId,
        title: data.text,
        runId,
        reservationId,
        modelSpec: reservation.budget.modelSpec,
        servingProvider: reservation.budget.servingProvider,
        recentMessageLimit: AGENT_REPLAY_COUNT,
        turn:
          decision.disposition === "retry"
            ? {
                kind: "retry",
                turnRequestId,
                priorRunId: decision.turn.runId,
                priorAttemptCount: decision.turn.attemptCount,
                userMessageId,
              }
            : {
                kind: "create",
                turnRequestId,
                clientRequestId: data.clientRequestId,
                text: data.text,
                pageRoute,
                userMessageId,
              },
      });

      const pageContext = data.pageContext ? `<page_context route="${data.pageContext.route}"/>\n` : "";
      const messages = admission.recentMessages
        .map((message) => {
          const text = partsToText(message.parts);
          return {
            role: message.role as string,
            text: message.id === userMessageId ? `${pageContext}${text}` : text.slice(0, AGENT_REPLAY_MAX_CHARS),
          };
        })
        .filter((message) => message.text);

      const externalRunId = await this.backgroundTaskService.dispatchTracked("agent-turn", {
        turnRequestId,
        conversationId: admission.conversationId,
        runId,
        companyId: user.companyId,
        userId: user.id,
        userName,
        locale,
        appBaseUrl: env.BASE_URL,
        messages,
        turnBudget: reservation.budget,
        tenant: { userId: user.id, companyId: user.companyId },
      });
      await this.repo.recordAgentTurnExternalRun(turnRequestId, externalRunId);

      return {
        ok: true as const,
        data: {
          disposition: "run",
          externalRunId,
          companyId: user.companyId,
          userId: user.id,
          runId,
          turnRequestId,
          userMessageId: admission.userMessageId,
          clientRequestId: data.clientRequestId,
          userName,
          conversationId: admission.conversationId,
          locale,
          messages,
          turnBudget: reservation.budget,
        },
      };
    } catch (error) {
      try {
        await this.repo.releasePreProviderAdmissionOrThrowUnscoped({
          companyId: user.companyId,
          userId: user.id,
          runId,
          reservationId,
        });
        if (conversationIsNew) await this.repo.deleteUnusedAgentConversation(conversationId);
      } catch (cleanupError) {
        Sentry.captureException(cleanupError, {
          tags: { kind: "agent-admission-cleanup-failure" },
        });
      }
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
