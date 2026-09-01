import { randomUUID } from "node:crypto";

import {
  AgentApprovalDecision,
  AgentMessageRole,
  Resource,
  Status,
  type AgentConversationOrigin,
  type Prisma,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { env } from "@/env";

import type { AgentUsageRepo } from "./agent-usage.service";
import { AGENT_CONVERSATION_PAGE_SIZE, AGENT_MESSAGE_PAGE_SIZE, type AgentConversationPage } from "./agent-history";
import { AGENT_MAX_CONCURRENT_RUNS_PER_USER } from "./agent-run-limits";
import { clientSafeAgentMessageParts, hasRenderableAgentMessageParts, partsToText } from "./agent-chat.schema";
import {
  isPendingAgentApprovalToolName,
  parsePendingAgentApprovalToolName,
  pendingAgentApprovalToolName,
} from "./agent-approval";
import {
  agentPlainTextPreview,
  sanitizeAgentConversationTitle,
  sanitizeAgentVisibleText,
  stripLegacyUserPageContextPrefix,
} from "./agent-output-safety";
import {
  areAgentTurnAffectedResources,
  AGENT_RUN_LEASE_MS,
  isAgentTurnTerminalCode,
  type AgentTurnRequestSnapshot,
  type AgentTurnRequestStatus,
  type AgentTurnTerminalCode,
} from "./agent-turn-request";
import type { AgentUsageSettlement } from "./agent-usage-settlement";
import { AGENT_CREDIT_MICROCENTS, resolveAgentCreditEntitlement } from "./agent-credit-policy";

type StoredAgentTurnRow = {
  id: string;
  conversationId: string;
  clientRequestId: string;
  text: string;
  pageRoute: string | null;
  status: string;
  runId: string;
  attemptCount: number;
  providerStartedAt: Date | null;
  userMessageId: string;
  assistantMessageId: string | null;
  terminalCode: string | null;
  modelSpec: string | null;
  affectedResources: unknown;
};

type AgentUsageUser = {
  id: string;
  companyId: string;
  status: Status;
  createdAt: Date;
  agentCreditActivatedAt: Date | null;
  subscription: {
    status: SubscriptionStatus;
    plan: SubscriptionPlan;
    trialEndDate: Date | null;
    agentCreditAnchorAt: Date | null;
    enterpriseAgentCreditsPerUser: number | null;
    createdAt: Date;
  } | null;
};

type HostedAiGlobalCommitment = {
  settledCostMicrocents: bigint;
  activeReservedCredits: bigint;
};

export type AgentTurnReplay = {
  snapshot: AgentTurnRequestSnapshot;
  assistantMessage: { id: string; parts: unknown; createdAt: Date } | null;
};

export type FinalizedAgentTurn = {
  assistantMessage: { id: string; parts: unknown; createdAt: Date };
  terminalCode: AgentTurnTerminalCode;
  affectedResources: AgentTurnRequestSnapshot["affectedResources"];
  costMicrocents: number;
  chargedCredits: number;
};

type AgentTurnAdmissionArgs = {
  conversationId: string;
  title: string | null;
  runId: string;
  reservationId: string;
  modelSpec: string;
  servingProvider: string;
  recentMessageLimit: number;
  turn:
    | {
        kind: "create";
        turnRequestId: string;
        clientRequestId: string;
        text: string;
        pageRoute: string | null;
        userMessageId: string;
      }
    | {
        kind: "retry";
        turnRequestId: string;
        priorRunId: string;
        priorAttemptCount: number;
        userMessageId: string;
      };
};

const TURN_STATUSES = new Set<AgentTurnRequestStatus>(["running", "completed", "failed", "uncertain"]);

function encodeConversationCursor(updatedAt: Date, id: string) {
  return Buffer.from(JSON.stringify({ updatedAt: updatedAt.toISOString(), id }), "utf8").toString("base64url");
}

function decodeConversationCursor(cursor: string) {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      updatedAt?: unknown;
      id?: unknown;
    };
    const updatedAt = typeof value.updatedAt === "string" ? new Date(value.updatedAt) : null;
    if (!updatedAt || !Number.isFinite(updatedAt.getTime()) || typeof value.id !== "string" || !value.id)
      throw new Error();
    return { updatedAt, id: value.id };
  } catch {
    throw new Error("Agent conversation cursor is invalid.");
  }
}

function turnStatus(value: string): AgentTurnRequestStatus {
  if (!TURN_STATUSES.has(value as AgentTurnRequestStatus)) throw new Error("Stored agent turn status is invalid.");
  return value as AgentTurnRequestStatus;
}

function assertTurnDate(value: Date | null, description: string) {
  if (value !== null && (!(value instanceof Date) || !Number.isFinite(value.getTime())))
    throw new Error(`${description} is invalid.`);
}

function sumCommittedAgentCredits(
  events: Array<{
    state: string;
    reservedCredits: number;
    chargedCredits: number;
  }>,
): number {
  let total = 0;
  for (const event of events) {
    const credits =
      event.state === "reserved" || event.state === "retained" ? event.reservedCredits : event.chargedCredits;
    if (!Number.isSafeInteger(credits) || credits < 0) throw new Error("Stored AI credit usage is invalid.");
    total += credits;
    if (!Number.isSafeInteger(total)) throw new Error("Stored AI credit usage total is invalid.");
  }
  return total;
}

export class PrismaAgentChatRepo extends BaseRepository implements AgentUsageRepo {
  private async resolveCurrentAgentCreditEntitlement(user: AgentUsageUser, now: Date) {
    if (!user.subscription) return null;

    const input = {
      appMode: env.APP_MODE,
      plan: user.subscription.plan,
      status: user.subscription.status,
      trialEndDate: user.subscription.trialEndDate,
      creditAnchorAt: user.subscription.agentCreditAnchorAt ?? user.subscription.createdAt,
      enterpriseCreditsPerUser: user.subscription.enterpriseAgentCreditsPerUser,
      activeSeatAt: user.agentCreditActivatedAt,
      now,
    } as const;
    const base = resolveAgentCreditEntitlement(input);
    const adjustmentCredits = await this.getUserCreditAdjustmentUnscoped(
      user.companyId,
      user.id,
      base.start,
      base.resetAt,
    );

    return resolveAgentCreditEntitlement({ ...input, adjustmentCredits });
  }

  private async admitsHostedAiGlobalSpend(args: {
    now: Date;
    excludeReservationId?: string;
    additionalReservedCredits?: number;
  }): Promise<boolean> {
    if (!env.HOSTED_AI_OPERATOR_CONTROLS_ENABLED) return true;

    const additionalReservedCredits = args.additionalReservedCredits ?? 0;
    if (!Number.isSafeInteger(additionalReservedCredits) || additionalReservedCredits < 0)
      throw new Error("Hosted AI global reservation amount is invalid.");

    const monthlySpendCapMicrocents = env.HOSTED_AI_MONTHLY_SPEND_CAP_MICROCENTS;
    if (monthlySpendCapMicrocents === null) return false;
    if (env.HOSTED_AI_PROVIDER_WORK_PAUSED) return false;

    await this.prisma
      .$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('customermates:hosted-ai-global-admission', 0))`;

    const monthStart = new Date(Date.UTC(args.now.getUTCFullYear(), args.now.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(args.now.getUTCFullYear(), args.now.getUTCMonth() + 1, 1));
    const excludeReservationId = args.excludeReservationId ?? null;
    const commitments = await this.prisma.$queryRaw<HostedAiGlobalCommitment[]>`
      SELECT
        COALESCE(
          SUM("costMicrocents") FILTER (
            WHERE "state" = 'settled'
              AND "settledAt" >= ${monthStart}
              AND "settledAt" < ${monthEnd}
          ),
          0
        )::bigint AS "settledCostMicrocents",
        COALESCE(
          SUM("reservedCredits"::bigint) FILTER (
            WHERE "state" IN ('reserved', 'retained')
              AND (${excludeReservationId}::text IS NULL OR "id" <> ${excludeReservationId}::text)
          ),
          0
        )::bigint AS "activeReservedCredits"
      FROM "AgentUsageEvent"
      WHERE
        (
          "state" = 'settled'
          AND "settledAt" >= ${monthStart}
          AND "settledAt" < ${monthEnd}
        )
        OR "state" IN ('reserved', 'retained')
    `;
    const commitment = commitments[0];
    if (!commitment) throw new Error("Hosted AI global commitment could not be read.");
    if (commitment.settledCostMicrocents < 0n) throw new Error("Hosted AI global settled-cost total is invalid.");
    if (commitment.activeReservedCredits < 0n) throw new Error("Hosted AI global reserved-credit total is invalid.");

    const committedMicrocents =
      commitment.settledCostMicrocents +
      (commitment.activeReservedCredits + BigInt(additionalReservedCredits)) * BigInt(AGENT_CREDIT_MICROCENTS);
    return committedMicrocents <= monthlySpendCapMicrocents;
  }

  private turnSnapshot(row: StoredAgentTurnRow, hasLaterMessages: boolean): AgentTurnRequestSnapshot {
    const status = turnStatus(row.status);
    assertTurnDate(row.providerStartedAt, "Agent provider-start timestamp");
    if (!Number.isSafeInteger(row.attemptCount) || row.attemptCount < 1)
      throw new Error("Stored agent turn attempt count is invalid.");
    if (row.terminalCode !== null && !isAgentTurnTerminalCode(row.terminalCode))
      throw new Error("Stored agent turn terminal code is invalid.");
    if (!areAgentTurnAffectedResources(row.affectedResources))
      throw new Error("Stored agent turn resources are invalid.");

    return {
      id: row.id,
      conversationId: row.conversationId,
      clientRequestId: row.clientRequestId,
      text: row.text,
      pageRoute: row.pageRoute,
      status,
      runId: row.runId,
      attemptCount: row.attemptCount,
      providerStartedAt: row.providerStartedAt,
      userMessageId: row.userMessageId,
      assistantMessageId: row.assistantMessageId,
      terminalCode: row.terminalCode,
      affectedResources: row.affectedResources,
      hasLaterMessages,
    };
  }
  async findMyConversation() {
    return this.prisma.agentConversation.findFirst({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        archivedAt: null,
      },
      orderBy: [{ selectedAt: "desc" }, { updatedAt: "desc" }, { id: "desc" }],
      select: { id: true },
    });
  }

  async findConversation(id: string) {
    return this.prisma.agentConversation.findFirst({
      where: {
        id,
        companyId: this.companyId,
        userId: this.userId,
        archivedAt: null,
      },
    });
  }

  async hasRunningTurn(conversationId: string): Promise<boolean> {
    const turn = await this.prisma.agentTurnRequest.findFirst({
      where: {
        conversationId,
        companyId: this.companyId,
        userId: this.userId,
        status: "running",
      },
      select: { id: true },
    });

    return turn !== null;
  }

  async listConversationPage(args: {
    archived: boolean;
    cursor?: string | null;
    limit?: number;
  }): Promise<AgentConversationPage> {
    const limit = Math.min(AGENT_CONVERSATION_PAGE_SIZE, Math.max(1, args.limit ?? AGENT_CONVERSATION_PAGE_SIZE));
    const cursor = args.cursor ? decodeConversationCursor(args.cursor) : null;
    const filters: Prisma.AgentConversationWhereInput[] = [];
    if (cursor) {
      filters.push({
        OR: [{ updatedAt: { lt: cursor.updatedAt } }, { updatedAt: cursor.updatedAt, id: { lt: cursor.id } }],
      });
    }
    const rows = await this.prisma.agentConversation.findMany({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        archivedAt: args.archived ? { not: null } : null,
        ...(filters.length ? { AND: filters } : {}),
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        messages: {
          orderBy: { sequence: "desc" },
          take: 1,
          select: { role: true, parts: true, createdAt: true },
        },
      },
    });

    const pageRows = rows.slice(0, limit);

    const conversations = pageRows.map((row) => {
      const latest = row.messages[0];
      const latestText = latest ? partsToText(latest.parts) : "";
      return {
        id: row.id,
        title: sanitizeAgentConversationTitle(row.title),
        preview: agentPlainTextPreview(
          latest?.role === AgentMessageRole.user
            ? stripLegacyUserPageContextPrefix(latestText)
            : sanitizeAgentVisibleText(latestText),
          140,
        ),
        updatedAt: row.updatedAt,
      };
    });

    const last = pageRows.at(-1);
    return {
      conversations,
      nextCursor: rows.length > limit && last ? encodeConversationCursor(last.updatedAt, last.id) : null,
    };
  }

  async admitAgentTurnOrThrow(args: AgentTurnAdmissionArgs) {
    const companyId = this.companyId;
    const userId = this.userId;
    return this.withCompanyTransaction(companyId, async () => {
      const admittedAt = new Date();
      const renewedLease = await this.prisma.agentRunLease.updateMany({
        where: {
          companyId,
          userId,
          runId: args.runId,
          expiresAt: { gt: admittedAt },
        },
        data: {
          expiresAt: new Date(admittedAt.getTime() + AGENT_RUN_LEASE_MS),
        },
      });
      if (renewedLease.count !== 1) throw new Error("Agent run lease expired before admission.");

      const reservation = await this.prisma.agentUsageEvent.findFirst({
        where: {
          id: args.reservationId,
          companyId,
          userId,
          state: "reserved",
          providerStartedAt: null,
        },
        select: { id: true },
      });
      if (!reservation) throw new Error("Agent usage reservation is missing before admission.");

      const conversationId = args.conversationId;
      const conversation = await this.prisma.agentConversation.findFirst({
        where: { id: conversationId, companyId, userId, archivedAt: null },
        select: { id: true },
      });
      if (!conversation) throw new Error("Conversation not found.");

      if (args.turn.kind === "retry") {
        const retried = await this.prisma.agentTurnRequest.updateMany({
          where: {
            id: args.turn.turnRequestId,
            companyId,
            userId,
            conversationId,
            runId: args.turn.priorRunId,
            attemptCount: args.turn.priorAttemptCount,
            status: "failed",
            providerStartedAt: null,
            assistantMessageId: null,
          },
          data: {
            status: "running",
            runId: args.runId,
            attemptCount: { increment: 1 },
            terminalAt: null,
            terminalCode: null,
            modelSpec: args.modelSpec,
            servingProvider: args.servingProvider,
            affectedResources: [],
          },
        });
        if (retried.count !== 1) throw new Error("The assistant retry could not be started.");
      } else {
        await this.prisma.agentTurnRequest.create({
          data: {
            id: args.turn.turnRequestId,
            companyId,
            userId,
            conversationId,
            clientRequestId: args.turn.clientRequestId,
            text: args.turn.text,
            pageRoute: args.turn.pageRoute,
            status: "running",
            runId: args.runId,
            attemptCount: 1,
            userMessageId: args.turn.userMessageId,
            modelSpec: args.modelSpec,
            servingProvider: args.servingProvider,
            affectedResources: [],
          },
        });
        await this.prisma.agentMessage.create({
          data: {
            id: args.turn.userMessageId,
            conversationId,
            companyId,
            turnRequestId: args.turn.turnRequestId,
            role: AgentMessageRole.user,
            parts: [{ type: "text", text: args.turn.text }],
          },
        });
      }

      const boundReservation = await this.prisma.agentUsageEvent.updateMany({
        where: { id: args.reservationId, companyId, userId, state: "reserved" },
        data: { turnRequestId: args.turn.turnRequestId },
      });
      if (boundReservation.count !== 1) throw new Error("Agent usage reservation could not be bound to the turn.");

      const touched = await this.prisma.agentConversation.updateMany({
        where: { id: conversationId, companyId, userId, archivedAt: null },
        data: { updatedAt: admittedAt, selectedAt: admittedAt },
      });
      if (touched.count !== 1) throw new Error("Conversation not found.");

      const recentMessages = await this.prisma.agentMessage.findMany({
        where: {
          conversationId,
          companyId,
          conversation: { userId, companyId, archivedAt: null },
        },
        orderBy: { sequence: "desc" },
        take: args.recentMessageLimit,
      });

      return {
        conversationId,
        userMessageId: args.turn.userMessageId,
        recentMessages: recentMessages.reverse(),
      };
    });
  }

  async archiveConversation(id: string) {
    const companyId = this.companyId;
    return this.withCompanyTransaction(companyId, async () => {
      const runningTurn = await this.prisma.agentTurnRequest.findFirst({
        where: {
          conversationId: id,
          companyId,
          userId: this.userId,
          status: "running",
        },
        select: { id: true },
      });
      if (runningTurn) return false;

      const archived = await this.prisma.agentConversation.updateMany({
        where: {
          id,
          companyId,
          userId: this.userId,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
      return archived.count === 1;
    });
  }

  async restoreConversation(id: string) {
    const now = new Date();
    const restored = await this.prisma.agentConversation.updateMany({
      where: {
        id,
        companyId: this.companyId,
        userId: this.userId,
        archivedAt: { not: null },
      },
      data: { archivedAt: null, selectedAt: now, updatedAt: now },
    });
    return restored.count === 1;
  }

  async deleteArchivedConversation(id: string) {
    const companyId = this.companyId;
    return this.withCompanyTransaction(companyId, async () => {
      const runningTurn = await this.prisma.agentTurnRequest.findFirst({
        where: {
          conversationId: id,
          companyId,
          userId: this.userId,
          status: "running",
        },
        select: { id: true },
      });
      if (runningTurn) return false;

      const deleted = await this.prisma.agentConversation.deleteMany({
        where: {
          id,
          companyId,
          userId: this.userId,
          archivedAt: { not: null },
        },
      });
      return deleted.count === 1;
    });
  }

  async getSuggestionSignals() {
    const select = { id: true };
    const [contact, organization, deal, service, task, widget, connectedAccount] = await Promise.all([
      this.prisma.contact.findFirst({
        where: this.accessWhere("contact"),
        select,
      }),
      this.prisma.organization.findFirst({
        where: this.accessWhere("organization"),
        select,
      }),
      this.prisma.deal.findFirst({
        where: this.accessWhere("deal"),
        select,
      }),
      this.prisma.service.findFirst({
        where: this.accessWhere("service"),
        select,
      }),
      this.prisma.task.findFirst({
        where: this.accessWhere("task"),
        select,
      }),
      this.prisma.widget.findFirst({
        where: {
          companyId: this.companyId,
          userId: this.userId,
        },
        select,
      }),
      this.prisma.connectedAccount.findFirst({
        where: this.canAccess(Resource.inboxMessages)
          ? {
              companyId: this.companyId,
              OR: [{ userId: this.userId }, { shared: true }],
            }
          : { companyId: this.companyId, id: { in: [] } },
        select,
      }),
    ]);

    return {
      contacts: Boolean(contact),
      organizations: Boolean(organization),
      deals: Boolean(deal),
      services: Boolean(service),
      tasks: Boolean(task),
      widgets: Boolean(widget),
      connectedAccounts: Boolean(connectedAccount),
    };
  }

  async findUserMessage(id: string) {
    return this.prisma.agentMessage.findFirst({
      where: {
        id,
        companyId: this.companyId,
        role: AgentMessageRole.user,
        conversation: {
          companyId: this.companyId,
          userId: this.userId,
          archivedAt: null,
        },
      },
      select: { id: true, conversationId: true, parts: true },
    });
  }

  async listRecentMessages(conversationId: string, limit: number) {
    const messages = await this.prisma.agentMessage.findMany({
      where: {
        conversationId,
        companyId: this.companyId,
        conversation: { userId: this.userId, companyId: this.companyId },
      },
      orderBy: { sequence: "desc" },
      take: limit,
    });

    return messages.reverse();
  }

  async listMessagePage(conversationId: string, before?: string | null) {
    const beforeSequence = before ? BigInt(before) : null;
    const rows = await this.prisma.agentMessage.findMany({
      where: {
        conversationId,
        companyId: this.companyId,
        conversation: {
          userId: this.userId,
          companyId: this.companyId,
          archivedAt: null,
        },
        ...(beforeSequence ? { sequence: { lt: beforeSequence } } : {}),
      },
      orderBy: { sequence: "desc" },
      take: AGENT_MESSAGE_PAGE_SIZE + 1,
    });
    const pageRows = rows.slice(0, AGENT_MESSAGE_PAGE_SIZE);
    const oldest = pageRows.at(-1);

    return {
      messages: pageRows.reverse(),
      nextCursor: rows.length > AGENT_MESSAGE_PAGE_SIZE && oldest ? oldest.sequence.toString() : null,
    };
  }

  @BypassTenantGuard
  async createPendingApprovalRequestOrThrowUnscoped(args: {
    conversationId: string;
    requestId: string;
    toolName: string;
    companyId: string;
    userId: string;
    expiresAt: Date;
  }) {
    const conversation = await this.prisma.agentConversation.findFirst({
      where: {
        id: args.conversationId,
        companyId: args.companyId,
        userId: args.userId,
        archivedAt: null,
      },
      select: { id: true },
    });
    if (!conversation) throw new Error("Conversation not found for agent approval.");

    await this.prisma.agentApproval.create({
      data: {
        conversationId: args.conversationId,
        companyId: args.companyId,
        requestId: args.requestId,
        toolName: pendingAgentApprovalToolName(args.toolName, args.expiresAt),
        decision: AgentApprovalDecision.reject,
      },
    });
  }

  async resolvePendingApprovalRequest(args: {
    conversationId: string;
    requestId: string;
    decision: AgentApprovalDecision;
  }) {
    const pending = await this.prisma.agentApproval.findFirst({
      where: {
        conversationId: args.conversationId,
        requestId: args.requestId,
        companyId: this.companyId,
        conversation: {
          companyId: this.companyId,
          userId: this.userId,
          archivedAt: null,
        },
      },
      select: { id: true, toolName: true, decision: true },
    });
    const parsed = pending ? parsePendingAgentApprovalToolName(pending.toolName) : null;
    if (!pending) return null;
    if (!parsed) {
      if (isPendingAgentApprovalToolName(pending.toolName) || pending.decision !== args.decision) return null;
      return { toolName: pending.toolName, resolved: true as const };
    }

    if (parsed.expiresAt.getTime() <= Date.now()) {
      await this.prisma.agentApproval.deleteMany({
        where: {
          id: pending.id,
          companyId: this.companyId,
          toolName: pending.toolName,
        },
      });
      return null;
    }

    const resolved = await this.prisma.agentApproval.updateMany({
      where: {
        id: pending.id,
        companyId: this.companyId,
        toolName: pending.toolName,
      },
      data: { decision: args.decision, toolName: parsed.toolName },
    });
    if (resolved.count === 1) return { toolName: parsed.toolName, resolved: true as const };

    const concurrentlyResolved = await this.prisma.agentApproval.findFirst({
      where: {
        id: pending.id,
        conversationId: args.conversationId,
        requestId: args.requestId,
        companyId: this.companyId,
        conversation: {
          companyId: this.companyId,
          userId: this.userId,
          archivedAt: null,
        },
      },
      select: { toolName: true, decision: true },
    });
    if (
      !concurrentlyResolved ||
      isPendingAgentApprovalToolName(concurrentlyResolved.toolName) ||
      concurrentlyResolved.decision !== args.decision
    )
      return null;

    return { toolName: concurrentlyResolved.toolName, resolved: true as const };
  }

  @BypassTenantGuard
  async discardPendingApprovalRequestUnscoped(args: {
    conversationId: string;
    requestId: string;
    companyId: string;
    userId: string;
  }) {
    const pending = await this.prisma.agentApproval.findFirst({
      where: {
        conversationId: args.conversationId,
        requestId: args.requestId,
        companyId: args.companyId,
        conversation: { companyId: args.companyId, userId: args.userId },
      },
      select: { id: true, toolName: true },
    });
    if (!pending || !isPendingAgentApprovalToolName(pending.toolName)) return;
    await this.prisma.agentApproval.deleteMany({
      where: {
        id: pending.id,
        companyId: args.companyId,
        toolName: pending.toolName,
      },
    });
  }

  @BypassTenantGuard
  async findApprovalDecisionUnscoped(args: {
    conversationId: string;
    requestId: string;
    companyId: string;
    userId: string;
  }) {
    const approval = await this.prisma.agentApproval.findFirst({
      where: {
        conversationId: args.conversationId,
        requestId: args.requestId,
        companyId: args.companyId,
        conversation: { companyId: args.companyId, userId: args.userId },
      },
      select: { decision: true, toolName: true },
    });
    return approval && !isPendingAgentApprovalToolName(approval.toolName) ? approval : null;
  }

  async recordUiCommandResult(args: {
    conversationId: string;
    commandId: string;
    name: string;
    ok: boolean;
    result: string;
  }) {
    await this.prisma.agentUiCommandResult.upsert({
      where: {
        companyId_conversationId_commandId: {
          companyId: this.companyId,
          conversationId: args.conversationId,
          commandId: args.commandId,
        },
      },
      create: { ...args, companyId: this.companyId },
      update: {
        companyId: this.companyId,
        name: args.name,
        ok: args.ok,
        result: args.result,
      },
    });
  }

  @BypassTenantGuard
  async takeUiCommandResultUnscoped(args: {
    conversationId: string;
    commandId: string;
    companyId: string;
    userId: string;
  }) {
    const result = await this.prisma.agentUiCommandResult.findFirst({
      where: {
        conversationId: args.conversationId,
        commandId: args.commandId,
        companyId: args.companyId,
        conversation: { companyId: args.companyId, userId: args.userId },
      },
      select: { id: true, name: true, ok: true, result: true },
    });
    if (!result) return null;

    await this.prisma.agentUiCommandResult.deleteMany({
      where: { id: result.id, companyId: args.companyId },
    });
    return { name: result.name, ok: result.ok, result: result.result };
  }

  private get agentTurnSelect() {
    return {
      id: true,
      conversationId: true,
      clientRequestId: true,
      text: true,
      pageRoute: true,
      status: true,
      runId: true,
      attemptCount: true,
      providerStartedAt: true,
      userMessageId: true,
      assistantMessageId: true,
      modelSpec: true,
      terminalCode: true,
      affectedResources: true,
    };
  }

  private async settleInterruptedTurn(
    row: StoredAgentTurnRow,
    now: Date,
    model: string,
    requireLease: boolean,
  ): Promise<"failed" | "uncertain"> {
    const nextStatus = row.providerStartedAt ? "uncertain" : "failed";
    if (nextStatus === "uncertain") {
      const reservation = await this.prisma.agentUsageEvent.findFirst({
        where: {
          turnRequestId: row.id,
          companyId: this.companyId,
          userId: this.userId,
          state: "reserved",
        },
        select: { id: true, reservedCredits: true },
      });
      if (!reservation) throw new Error("Interrupted agent usage reservation is missing.");
      const settled = await this.prisma.agentUsageEvent.updateMany({
        where: {
          id: reservation.id,
          companyId: this.companyId,
          userId: this.userId,
          state: "reserved",
        },
        data: {
          state: "retained",
          model: row.modelSpec ?? model,
          costMicrocents: 0,
          costSource: "estimated",
          chargedCredits: reservation.reservedCredits,
          settledAt: now,
        },
      });
      if (settled.count !== 1) throw new Error("Interrupted agent usage reservation could not be settled.");
    } else {
      const released = await this.prisma.agentUsageEvent.updateMany({
        where: {
          turnRequestId: row.id,
          companyId: this.companyId,
          userId: this.userId,
          state: "reserved",
        },
        data: { state: "released", chargedCredits: 0, settledAt: now },
      });
      if (released.count !== 1) throw new Error("Interrupted agent usage reservation could not be released.");
    }

    const updated = await this.prisma.agentTurnRequest.updateMany({
      where: {
        id: row.id,
        companyId: this.companyId,
        userId: this.userId,
        runId: row.runId,
        status: "running",
      },
      data: {
        status: nextStatus,
        terminalAt: now,
        terminalCode: null,
        affectedResources: [],
      },
    });
    if (updated.count !== 1) throw new Error("Interrupted agent turn could not be reconciled.");

    const deleted = await this.prisma.agentRunLease.deleteMany({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        runId: row.runId,
      },
    });
    if (requireLease && deleted.count !== 1) throw new Error("Interrupted agent run lease could not be reconciled.");
    return nextStatus;
  }

  async normalizeExpiredAgentRunLease(now: Date, model: string) {
    const companyId = this.companyId;
    return this.withCompanyTransaction(companyId, () => this.normalizeExpiredAgentRunLeaseInTransaction(now, model));
  }

  private async normalizeExpiredAgentRunLeaseInTransaction(now: Date, model: string) {
    const expired = await this.prisma.agentRunLease.findMany({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        expiresAt: { lte: now },
      },
      select: { runId: true, expiresAt: true },
    });

    for (const lease of expired) await this.reconcileExpiredLease(lease, now, model);
  }

  private async reconcileExpiredLease(lease: { runId: string }, now: Date, model: string) {
    const turn = await this.prisma.agentTurnRequest.findFirst({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        runId: lease.runId,
        status: "running",
      },
      select: this.agentTurnSelect,
    });
    if (turn) {
      await this.settleInterruptedTurn(turn, now, model, true);
      return;
    }

    await this.prisma.agentUsageEvent.updateMany({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        state: "reserved",
        turnRequestId: null,
      },
      data: { state: "released", chargedCredits: 0, settledAt: now },
    });
    const deleted = await this.prisma.agentRunLease.deleteMany({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        runId: lease.runId,
      },
    });
    if (deleted.count !== 1) throw new Error("Expired agent run lease could not be reconciled.");
  }

  async findAgentTurnRequestForAdmission(
    clientRequestId: string,
    now: Date,
    model: string,
  ): Promise<AgentTurnReplay | null> {
    const companyId = this.companyId;
    return this.withCompanyTransaction(companyId, () =>
      this.findAgentTurnRequestForAdmissionInTransaction(clientRequestId, now, model),
    );
  }

  private async findAgentTurnRequestForAdmissionInTransaction(
    clientRequestId: string,
    now: Date,
    model: string,
  ): Promise<AgentTurnReplay | null> {
    const row = await this.prisma.agentTurnRequest.findFirst({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        clientRequestId,
      },
      select: this.agentTurnSelect,
    });
    if (!row) return null;

    const userMessage = await this.prisma.agentMessage.findFirst({
      where: {
        id: row.userMessageId,
        companyId: this.companyId,
        conversationId: row.conversationId,
        turnRequestId: row.id,
        role: AgentMessageRole.user,
      },
      select: {
        id: true,
        conversationId: true,
        role: true,
        parts: true,
        createdAt: true,
        sequence: true,
        turnRequestId: true,
      },
    });
    if (!userMessage) throw new Error("Stored agent turn user message is missing.");

    const laterMessage = await this.prisma.agentMessage.findFirst({
      where: {
        companyId: this.companyId,
        conversationId: row.conversationId,
        sequence: { gt: userMessage.sequence },
      },
      select: {
        id: true,
        conversationId: true,
        role: true,
        parts: true,
        createdAt: true,
        sequence: true,
        turnRequestId: true,
      },
    });

    let reconciledRow = row;
    if (turnStatus(row.status) === "running") {
      const lease = await this.prisma.agentRunLease.findFirst({
        where: {
          companyId: this.companyId,
          userId: this.userId,
          runId: row.runId,
          expiresAt: { gt: now },
        },
        select: { runId: true, expiresAt: true },
      });
      if (!lease) {
        const status = await this.settleInterruptedTurn(row, now, model, false);
        reconciledRow = { ...row, status };
      }
    }

    const assistantMessage = reconciledRow.assistantMessageId
      ? await this.prisma.agentMessage.findFirst({
          where: {
            id: reconciledRow.assistantMessageId,
            companyId: this.companyId,
            conversationId: reconciledRow.conversationId,
            turnRequestId: reconciledRow.id,
            role: AgentMessageRole.assistant,
          },
          select: {
            id: true,
            conversationId: true,
            role: true,
            parts: true,
            createdAt: true,
            sequence: true,
            turnRequestId: true,
          },
        })
      : null;
    const assistantMessageIsRenderable =
      assistantMessage !== null &&
      hasRenderableAgentMessageParts(
        clientSafeAgentMessageParts(assistantMessage.parts, {
          sanitizeText: true,
        }),
      );
    const completedIsReplayable = assistantMessageIsRenderable && reconciledRow.terminalCode !== null;
    if (turnStatus(reconciledRow.status) === "completed" && !completedIsReplayable) {
      const repaired = await this.prisma.agentTurnRequest.updateMany({
        where: {
          id: reconciledRow.id,
          companyId: this.companyId,
          userId: this.userId,
          status: "completed",
          assistantMessageId: reconciledRow.assistantMessageId,
        },
        data: {
          status: "uncertain",
          assistantMessageId: assistantMessageIsRenderable ? reconciledRow.assistantMessageId : null,
          terminalCode: null,
          affectedResources: [],
          terminalAt: now,
        },
      });
      if (repaired.count !== 1) throw new Error("Incomplete completed agent turn could not be reconciled.");
      reconciledRow = {
        ...reconciledRow,
        status: "uncertain",
        assistantMessageId: assistantMessageIsRenderable ? reconciledRow.assistantMessageId : null,
        terminalCode: null,
        affectedResources: [],
      };
    }
    const snapshot = this.turnSnapshot(reconciledRow, Boolean(laterMessage));
    return {
      snapshot,
      assistantMessage: assistantMessage
        ? {
            id: assistantMessage.id,
            parts: assistantMessage.parts,
            createdAt: assistantMessage.createdAt,
          }
        : null,
    };
  }

  async createAgentConversationForRun(args: {
    conversationId: string;
    title: string | null;
    modelKey?: string | null;
    now: Date;
    origin?: AgentConversationOrigin;
    creditCeiling?: number | null;
  }) {
    await this.prisma.agentConversation.create({
      data: {
        id: args.conversationId,
        companyId: this.companyId,
        userId: this.userId,
        title: sanitizeAgentConversationTitle(args.title),
        modelKey: args.modelKey ?? null,
        origin: args.origin ?? "user",
        creditCeiling: args.creditCeiling ?? null,
        selectedAt: args.now,
      },
      select: { id: true },
    });
  }

  async deleteUnusedAgentConversation(conversationId: string) {
    await this.prisma.agentConversation.deleteMany({
      where: {
        id: conversationId,
        companyId: this.companyId,
        userId: this.userId,
        messages: { none: {} },
        turnRequests: { none: {} },
      },
    });
  }

  async isAtAgentRunLimit(now: Date) {
    const active = await this.prisma.agentRunLease.count({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        expiresAt: { gt: now },
      },
    });
    return active >= AGENT_MAX_CONCURRENT_RUNS_PER_USER;
  }

  async claimAgentRunLease(args: { conversationId: string; runId: string; expiresAt: Date; now: Date }) {
    if (await this.isAtAgentRunLimit(args.now)) return "atUserLimit" as const;

    const claimed = await this.prisma.agentRunLease.createMany({
      data: [
        {
          conversationId: args.conversationId,
          companyId: this.companyId,
          userId: this.userId,
          runId: args.runId,
          expiresAt: args.expiresAt,
        },
      ],
      skipDuplicates: true,
    });
    return claimed.count === 1 ? ("claimed" as const) : ("conversationBusy" as const);
  }

  @BypassTenantGuard
  async claimAgentToolReceiptUnscoped(args: {
    turnRequestId: string;
    companyId: string;
    toolCallId: string;
    toolName: string;
  }): Promise<{ state: "claimed" } | { state: "settled"; resultJson: unknown }> {
    const existing = await this.prisma.agentToolReceipt.findUnique({
      where: {
        turnRequestId_toolCallId: {
          turnRequestId: args.turnRequestId,
          toolCallId: args.toolCallId,
        },
      },
      select: { state: true, resultJson: true },
    });
    if (existing?.state === "settled") return { state: "settled", resultJson: existing.resultJson };
    if (existing) return { state: "claimed" };

    await this.prisma.agentToolReceipt.create({
      data: {
        turnRequestId: args.turnRequestId,
        companyId: args.companyId,
        toolCallId: args.toolCallId,
        toolName: args.toolName,
      },
    });
    return { state: "claimed" };
  }

  @BypassTenantGuard
  async settleAgentToolReceiptUnscoped(args: {
    turnRequestId: string;
    companyId: string;
    toolCallId: string;
    resultJson: Prisma.InputJsonValue;
  }) {
    const settled = await this.prisma.agentToolReceipt.updateMany({
      where: {
        turnRequestId: args.turnRequestId,
        companyId: args.companyId,
        toolCallId: args.toolCallId,
        state: "claimed",
      },
      data: {
        state: "settled",
        resultJson: args.resultJson,
        settledAt: new Date(),
      },
    });
    if (settled.count !== 1) throw new Error("Agent tool receipt could not be settled.");
  }

  @BypassTenantGuard
  async recordAgentRunRoundUnscoped(args: {
    turnRequestId: string;
    companyId: string;
    runId: string;
    roundIndex: number;
    parts: Prisma.InputJsonValue;
    finishReason: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
    reasoningTokens: number;
    costMicrocents: number;
    modelSpec: string;
    servingProvider: string | null;
  }) {
    const counts = [
      args.inputTokens,
      args.outputTokens,
      args.cacheReadTokens,
      args.cacheWriteTokens,
      args.reasoningTokens,
      args.costMicrocents,
      args.roundIndex,
    ];
    if (counts.some((value) => !Number.isSafeInteger(value) || value < 0))
      throw new Error("Agent run round accounting is invalid.");

    const record = {
      companyId: args.companyId,
      runId: args.runId,
      parts: args.parts,
      finishReason: args.finishReason,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cacheReadTokens: args.cacheReadTokens,
      cacheWriteTokens: args.cacheWriteTokens,
      reasoningTokens: args.reasoningTokens,
      costMicrocents: args.costMicrocents,
      modelSpec: args.modelSpec,
      servingProvider: args.servingProvider,
    };

    await this.prisma.agentRunRound.upsert({
      where: {
        turnRequestId_roundIndex: {
          turnRequestId: args.turnRequestId,
          roundIndex: args.roundIndex,
        },
      },
      create: {
        ...record,
        turnRequestId: args.turnRequestId,
        roundIndex: args.roundIndex,
      },
      update: record,
    });
  }

  async requestAgentTurnCancellation(args: { conversationId: string }): Promise<boolean> {
    const requested = await this.prisma.agentTurnRequest.updateMany({
      where: {
        conversationId: args.conversationId,
        companyId: this.companyId,
        userId: this.userId,
        status: "running",
        cancellationRequestedAt: null,
      },
      data: { cancellationRequestedAt: new Date() },
    });
    if (requested.count > 0) return true;

    const alreadyRequested = await this.prisma.agentTurnRequest.findFirst({
      where: {
        conversationId: args.conversationId,
        companyId: this.companyId,
        userId: this.userId,
        status: "running",
        cancellationRequestedAt: { not: null },
      },
      select: { id: true },
    });
    return Boolean(alreadyRequested);
  }

  @BypassTenantGuard
  async isAgentTurnCancellationRequestedUnscoped(args: { turnRequestId: string; companyId: string }): Promise<boolean> {
    const turn = await this.prisma.agentTurnRequest.findFirst({
      where: { id: args.turnRequestId, companyId: args.companyId },
      select: { cancellationRequestedAt: true },
    });
    return Boolean(turn?.cancellationRequestedAt);
  }

  async recordAgentTurnExternalRun(turnRequestId: string, externalRunId: string): Promise<void> {
    await this.prisma.agentTurnRequest.updateMany({
      where: {
        id: turnRequestId,
        companyId: this.companyId,
        userId: this.userId,
      },
      data: { externalRunId },
    });
  }

  async findAgentTurnExternalRun(conversationId: string): Promise<string | null> {
    const turn = await this.prisma.agentTurnRequest.findFirst({
      where: {
        conversationId,
        companyId: this.companyId,
        userId: this.userId,
        externalRunId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { externalRunId: true },
    });
    return turn?.externalRunId ?? null;
  }

  @BypassTenantGuard
  async extendAgentRunLeaseForSuspensionUnscoped(args: {
    companyId: string;
    userId: string;
    runId: string;
    until: Date;
  }): Promise<boolean> {
    const held = await this.prisma.agentRunLease.updateMany({
      where: {
        companyId: args.companyId,
        userId: args.userId,
        runId: args.runId,
      },
      data: { expiresAt: new Date(args.until.getTime() + AGENT_RUN_LEASE_MS) },
    });
    return held.count === 1;
  }

  @BypassTenantGuard
  async heartbeatAgentRunUnscoped(args: {
    turnRequestId: string;
    companyId: string;
    userId: string;
    runId: string;
    now?: Date;
  }): Promise<boolean> {
    const beatAt = args.now ?? new Date();
    const renewed = await this.prisma.agentRunLease.updateMany({
      where: {
        companyId: args.companyId,
        userId: args.userId,
        runId: args.runId,
      },
      data: { expiresAt: new Date(beatAt.getTime() + AGENT_RUN_LEASE_MS) },
    });
    if (renewed.count !== 1) return false;

    await this.prisma.agentTurnRequest.updateMany({
      where: {
        id: args.turnRequestId,
        companyId: args.companyId,
        userId: args.userId,
        runId: args.runId,
        status: "running",
      },
      data: { heartbeatAt: beatAt },
    });
    return true;
  }

  @BypassTenantGuard
  async markAgentTurnProviderStartedUnscoped(args: {
    turnRequestId: string;
    conversationId: string;
    companyId: string;
    userId: string;
    runId: string;
  }) {
    return this.withCompanyTransaction(args.companyId, async () => {
      const startedAt = new Date();
      const renewedLease = await this.prisma.agentRunLease.updateMany({
        where: {
          companyId: args.companyId,
          userId: args.userId,
          runId: args.runId,
          expiresAt: { gt: startedAt },
        },
        data: { expiresAt: new Date(startedAt.getTime() + AGENT_RUN_LEASE_MS) },
      });
      if (renewedLease.count !== 1) throw new Error("Agent run lease expired before the provider started.");

      const user = await this.findUserForUsageUnscoped(args.userId);
      if (!user?.subscription) throw new Error("Agent credit subscription is unavailable at provider start.");
      if (user.status !== Status.active) throw new Error("Agent credit user is not an active seat at provider start.");
      const entitlement = await this.resolveCurrentAgentCreditEntitlement(user, startedAt);
      if (!entitlement) throw new Error("Agent credit entitlement is unavailable at provider start.");
      if (entitlement.blockedReason) throw new Error(`Agent credits are blocked: ${entitlement.blockedReason}.`);
      const reservation = await this.prisma.agentUsageEvent.findFirst({
        where: {
          turnRequestId: args.turnRequestId,
          companyId: args.companyId,
          userId: args.userId,
          state: "reserved",
        },
        select: { id: true, reservedCredits: true },
      });
      if (!reservation) throw new Error("Agent usage reservation is missing at provider start.");
      const currentEvents = await this.prisma.agentUsageEvent.findMany({
        where: {
          id: { not: reservation.id },
          companyId: args.companyId,
          userId: args.userId,
          periodStart: entitlement.start,
          periodEnd: entitlement.resetAt,
          state: { in: ["reserved", "settled", "retained"] },
        },
        select: { state: true, reservedCredits: true, chargedCredits: true },
      });
      const usedCredits = sumCommittedAgentCredits(currentEvents);
      if (usedCredits + reservation.reservedCredits > entitlement.limit)
        throw new Error("Agent credit reservation exceeds the current allowance at provider start.");

      if (!(await this.admitsHostedAiGlobalSpend({ now: startedAt }))) return false;

      const updated = await this.prisma.agentTurnRequest.updateMany({
        where: {
          id: args.turnRequestId,
          conversationId: args.conversationId,
          companyId: args.companyId,
          userId: args.userId,
          runId: args.runId,
          status: "running",
          providerStartedAt: null,
        },
        data: { providerStartedAt: startedAt },
      });
      if (updated.count !== 1) throw new Error("Agent turn could not be marked as provider-started.");

      const usage = await this.prisma.agentUsageEvent.updateMany({
        where: {
          id: reservation.id,
          companyId: args.companyId,
          userId: args.userId,
          state: "reserved",
          providerStartedAt: null,
        },
        data: {
          providerStartedAt: startedAt,
          planSnapshot: entitlement.plan,
          subscriptionStatusSnapshot: user.subscription.status,
          allowanceCreditsSnapshot: entitlement.limit,
          periodStart: entitlement.start,
          periodEnd: entitlement.resetAt,
        },
      });
      if (usage.count !== 1) throw new Error("Agent usage reservation could not be marked as provider-started.");

      return true;
    });
  }

  @BypassTenantGuard
  async canStartNextHostedAiProviderRoundUnscoped(args: {
    turnRequestId: string;
    companyId: string;
    userId: string;
  }): Promise<boolean> {
    return this.withCompanyTransaction(args.companyId, async () => {
      const now = new Date();
      const user = await this.findUserForUsageUnscoped(args.userId);
      if (!user || user.companyId !== args.companyId || user.status !== Status.active || !user.subscription)
        return false;

      const entitlement = await this.resolveCurrentAgentCreditEntitlement(user, now);
      if (!entitlement || entitlement.blockedReason) return false;

      const reservation = await this.prisma.agentUsageEvent.findFirst({
        where: {
          turnRequestId: args.turnRequestId,
          companyId: args.companyId,
          userId: args.userId,
          state: "reserved",
          providerStartedAt: { not: null },
        },
        select: {
          id: true,
          reservedCredits: true,
          periodStart: true,
          periodEnd: true,
        },
      });
      if (
        !reservation ||
        reservation.periodStart.getTime() !== entitlement.start.getTime() ||
        reservation.periodEnd.getTime() !== entitlement.resetAt.getTime()
      )
        return false;

      const others = await this.prisma.agentUsageEvent.findMany({
        where: {
          id: { not: reservation.id },
          companyId: args.companyId,
          userId: args.userId,
          periodStart: entitlement.start,
          periodEnd: entitlement.resetAt,
          state: { in: ["reserved", "settled", "retained"] },
        },
        select: { state: true, reservedCredits: true, chargedCredits: true },
      });
      const committedElsewhere = sumCommittedAgentCredits(others);
      if (committedElsewhere + reservation.reservedCredits > entitlement.limit) return false;

      if (!(await this.admitsHostedAiGlobalSpend({ now }))) return false;

      return true;
    });
  }

  @BypassTenantGuard
  async finalizeAgentTurnOrThrowUnscoped(args: {
    turnRequestId: string;
    conversationId: string;
    companyId: string;
    userId: string;
    runId: string;
    parts: Prisma.InputJsonValue;
    terminalCode: AgentTurnTerminalCode;
    affectedResources: AgentTurnRequestSnapshot["affectedResources"];
    usageSettlement: AgentUsageSettlement | null;
  }): Promise<FinalizedAgentTurn> {
    if (!isAgentTurnTerminalCode(args.terminalCode)) throw new Error("Agent turn terminal code is invalid.");
    if (!areAgentTurnAffectedResources(args.affectedResources)) throw new Error("Agent turn resources are invalid.");
    const safeParts = clientSafeAgentMessageParts(args.parts, {
      sanitizeText: true,
    });
    if (!hasRenderableAgentMessageParts(safeParts)) throw new Error("Agent turn canonical reply is not renderable.");

    const settlement = args.usageSettlement;
    if (
      settlement &&
      (!Number.isSafeInteger(settlement.inputTokens) ||
        settlement.inputTokens < 0 ||
        !Number.isSafeInteger(settlement.outputTokens) ||
        settlement.outputTokens < 0 ||
        !Number.isSafeInteger(settlement.cacheReadTokens) ||
        settlement.cacheReadTokens < 0 ||
        !Number.isSafeInteger(settlement.cacheWriteTokens) ||
        settlement.cacheWriteTokens < 0 ||
        !Number.isSafeInteger(settlement.costMicrocents) ||
        settlement.costMicrocents < 0 ||
        !Number.isSafeInteger(settlement.reservedCredits) ||
        settlement.reservedCredits < 1 ||
        !Number.isSafeInteger(settlement.chargedCredits) ||
        settlement.chargedCredits < 0 ||
        settlement.chargedCredits > settlement.reservedCredits ||
        settlement.state !== "settled" ||
        !settlement.model ||
        typeof settlement.policyBreach !== "boolean")
    )
      throw new Error("Agent usage settlement is invalid.");

    return this.withCompanyTransaction(args.companyId, async () => {
      const turn = await this.prisma.agentTurnRequest.findFirst({
        where: {
          id: args.turnRequestId,
          conversationId: args.conversationId,
          companyId: args.companyId,
          userId: args.userId,
          runId: args.runId,
          status: "running",
        },
        select: this.agentTurnSelect,
      });
      if (!turn) throw new Error("Agent turn is no longer active.");
      if (Boolean(turn.providerStartedAt) !== Boolean(settlement))
        throw new Error("Agent usage settlement does not match provider-start evidence.");

      const lease = await this.prisma.agentRunLease.findFirst({
        where: {
          companyId: args.companyId,
          userId: args.userId,
          runId: args.runId,
        },
        select: { runId: true, expiresAt: true },
      });
      if (!lease) throw new Error("Agent run lease is missing.");

      const conversationRow = await this.prisma.agentConversation.findFirst({
        where: {
          id: args.conversationId,
          companyId: args.companyId,
          userId: args.userId,
          archivedAt: null,
        },
        select: { updatedAt: true },
      });
      if (!conversationRow) throw new Error("Conversation not found.");
      const committedAt = new Date(Math.max(Date.now(), conversationRow.updatedAt.getTime()));

      if (settlement) {
        const settled = await this.prisma.agentUsageEvent.updateMany({
          where: {
            turnRequestId: args.turnRequestId,
            companyId: args.companyId,
            userId: args.userId,
            state: "reserved",
            reservedCredits: settlement.reservedCredits,
          },
          data: {
            state: settlement.state,
            model: settlement.model,
            inputTokens: settlement.inputTokens,
            outputTokens: settlement.outputTokens,
            cacheReadTokens: settlement.cacheReadTokens,
            cacheWriteTokens: settlement.cacheWriteTokens,
            costMicrocents: settlement.costMicrocents,
            costSource: settlement.costSource,
            chargedCredits: settlement.chargedCredits,
            policyBreach: settlement.policyBreach,
            settledAt: committedAt,
          },
        });
        if (settled.count !== 1) throw new Error("Agent usage reservation could not be settled.");
      } else {
        const released = await this.prisma.agentUsageEvent.updateMany({
          where: {
            turnRequestId: args.turnRequestId,
            companyId: args.companyId,
            userId: args.userId,
            state: "reserved",
          },
          data: {
            state: "released",
            chargedCredits: 0,
            settledAt: committedAt,
          },
        });
        if (released.count !== 1) throw new Error("Agent usage reservation could not be released.");
      }

      const terminalCode = settlement?.policyBreach ? "policyBreach" : args.terminalCode;
      const assistantMessage = await this.prisma.agentMessage.create({
        data: {
          id: randomUUID(),
          conversationId: args.conversationId,
          companyId: args.companyId,
          turnRequestId: args.turnRequestId,
          role: AgentMessageRole.assistant,
          parts: safeParts as unknown as Prisma.InputJsonValue,
          createdAt: committedAt,
        },
      });

      const conversation = await this.prisma.agentConversation.updateMany({
        where: {
          id: args.conversationId,
          companyId: args.companyId,
          userId: args.userId,
          archivedAt: null,
        },
        data: { updatedAt: committedAt },
      });
      if (conversation.count !== 1) throw new Error("Conversation not found.");

      const completed = await this.prisma.agentTurnRequest.updateMany({
        where: {
          id: args.turnRequestId,
          conversationId: args.conversationId,
          companyId: args.companyId,
          userId: args.userId,
          runId: args.runId,
          status: "running",
        },
        data: {
          status: "completed",
          assistantMessageId: assistantMessage.id,
          terminalCode,
          affectedResources: args.affectedResources,
          terminalAt: committedAt,
        },
      });
      if (completed.count !== 1) throw new Error("Agent turn could not be completed.");

      const released = await this.prisma.agentRunLease.deleteMany({
        where: {
          companyId: args.companyId,
          userId: args.userId,
          runId: args.runId,
        },
      });
      if (released.count !== 1) throw new Error("Agent run lease could not be released.");

      return {
        assistantMessage,
        terminalCode,
        affectedResources: args.affectedResources,
        costMicrocents: settlement?.costMicrocents ?? 0,
        chargedCredits: settlement?.chargedCredits ?? 0,
      };
    });
  }

  @BypassTenantGuard
  async releasePreProviderAdmissionOrThrowUnscoped(args: {
    userId: string;
    companyId: string;
    runId: string;
    reservationId: string;
  }) {
    return this.withCompanyTransaction(args.companyId, async () => {
      const turn = await this.prisma.agentTurnRequest.findFirst({
        where: {
          companyId: args.companyId,
          userId: args.userId,
          runId: args.runId,
        },
        select: { id: true },
      });
      if (turn) return { disposition: "turn_exists" as const };

      const usage = await this.prisma.agentUsageEvent.findFirst({
        where: {
          id: args.reservationId,
          companyId: args.companyId,
          userId: args.userId,
        },
        select: { state: true, providerStartedAt: true },
      });
      if (usage && (usage.state === "settled" || usage.providerStartedAt !== null))
        throw new Error("Agent usage has provider-start evidence and cannot be released.");

      if (usage?.state === "reserved") {
        const released = await this.prisma.agentUsageEvent.updateMany({
          where: {
            id: args.reservationId,
            companyId: args.companyId,
            userId: args.userId,
            state: "reserved",
            providerStartedAt: null,
          },
          data: { state: "released", chargedCredits: 0, settledAt: new Date() },
        });
        if (released.count !== 1) throw new Error("Agent usage reservation could not be released.");
      }

      await this.prisma.agentRunLease.deleteMany({
        where: {
          companyId: args.companyId,
          userId: args.userId,
          runId: args.runId,
        },
      });
      return { disposition: "released" as const };
    });
  }

  @BypassTenantGuard
  async createAssistantMessageOrThrowUnscoped(args: {
    conversationId: string;
    companyId: string;
    userId: string;
    parts: Prisma.InputJsonValue;
  }) {
    await this.withCompanyTransaction(args.companyId, async () => {
      const now = new Date();
      const updated = await this.prisma.agentConversation.updateMany({
        where: {
          id: args.conversationId,
          companyId: args.companyId,
          userId: args.userId,
          archivedAt: null,
        },
        data: { updatedAt: now },
      });
      if (updated.count !== 1) throw new Error("Conversation not found.");

      await this.prisma.agentMessage.create({
        data: {
          conversationId: args.conversationId,
          companyId: args.companyId,
          role: AgentMessageRole.assistant,
          parts: args.parts,
          createdAt: now,
        },
      });
    });
  }

  @BypassTenantGuard
  async getUserCreditUsageUnscoped(companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    const [events, recent] = await Promise.all([
      this.prisma.agentUsageEvent.findMany({
        where: {
          companyId,
          userId,
          periodStart,
          periodEnd,
          state: { in: ["reserved", "settled", "retained"] },
        },
        select: { state: true, reservedCredits: true, chargedCredits: true },
      }),
      this.prisma.agentUsageEvent.findFirst({
        where: {
          companyId,
          userId,
          periodStart,
          periodEnd,
          state: { in: ["settled", "retained"] },
        },
        orderBy: [{ settledAt: "desc" }, { id: "desc" }],
        select: { chargedCredits: true },
      }),
    ]);

    return {
      usedCredits: sumCommittedAgentCredits(events),
      recentTurnCredits: recent?.chargedCredits ?? null,
    };
  }

  @BypassTenantGuard
  async getUserCreditAdjustmentUnscoped(companyId: string, userId: string, periodStart: Date, periodEnd: Date) {
    const aggregate = await this.prisma.agentCreditAdjustment.aggregate({
      where: { companyId, userId, periodStart, periodEnd },
      _sum: { creditDelta: true },
    });
    const adjustmentCredits = aggregate._sum.creditDelta ?? 0;
    if (!Number.isSafeInteger(adjustmentCredits)) throw new Error("Stored AI credit adjustment is invalid.");

    return adjustmentCredits;
  }

  @BypassTenantGuard
  async findUserForUsageUnscoped(userId: string): Promise<AgentUsageUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        companyId: true,
        status: true,
        createdAt: true,
        agentCreditActivatedAt: true,
        company: {
          select: {
            subscription: {
              select: {
                status: true,
                plan: true,
                trialEndDate: true,
                agentCreditAnchorAt: true,
                enterpriseAgentCreditsPerUser: true,
                createdAt: true,
              },
            },
          },
        },
      },
    });
    if (!user) return null;

    return {
      id: user.id,
      companyId: user.companyId,
      status: user.status,
      createdAt: user.createdAt,
      agentCreditActivatedAt: user.agentCreditActivatedAt,
      subscription: user.company.subscription,
    };
  }

  @BypassTenantGuard
  async reserveUsageEventUnscoped(event: {
    id: string;
    companyId: string;
    userId: string;
    sessionId: string;
    reservedCredits: number;
    planSnapshot: SubscriptionPlan;
    subscriptionStatusSnapshot: SubscriptionStatus;
    allowanceCreditsSnapshot: number;
    periodStart: Date;
    periodEnd: Date;
  }) {
    if (!Number.isSafeInteger(event.reservedCredits) || event.reservedCredits < 1)
      throw new Error("Agent credit reservation is invalid.");

    return this.withCompanyTransaction(event.companyId, async () => {
      const reservedAt = new Date();
      const user = await this.findUserForUsageUnscoped(event.userId);
      if (!user || user.companyId !== event.companyId || user.status !== Status.active || !user.subscription)
        throw new Error("Agent credit seat is unavailable.");

      const entitlement = await this.resolveCurrentAgentCreditEntitlement(user, reservedAt);
      if (!entitlement) throw new Error("Agent credit entitlement is unavailable.");
      if (entitlement.blockedReason) throw new Error(`Agent credits are blocked: ${entitlement.blockedReason}.`);

      const existing = await this.prisma.agentUsageEvent.findMany({
        where: {
          companyId: event.companyId,
          userId: event.userId,
          periodStart: entitlement.start,
          periodEnd: entitlement.resetAt,
          state: { in: ["reserved", "settled", "retained"] },
        },
        select: { state: true, reservedCredits: true, chargedCredits: true },
      });
      const used = sumCommittedAgentCredits(existing);
      if (used + event.reservedCredits > entitlement.limit)
        throw new Error("Agent credit reservation exceeds the current allowance.");

      if (
        !(await this.admitsHostedAiGlobalSpend({
          now: reservedAt,
          additionalReservedCredits: event.reservedCredits,
        }))
      )
        return false;

      await this.prisma.agentUsageEvent.create({
        data: {
          ...event,
          planSnapshot: entitlement.plan,
          subscriptionStatusSnapshot: user.subscription.status,
          allowanceCreditsSnapshot: entitlement.limit,
          periodStart: entitlement.start,
          periodEnd: entitlement.resetAt,
          state: "reserved",
          chargedCredits: 0,
          policyBreach: false,
        },
      });

      return true;
    });
  }

  @BypassTenantGuard
  async extendUsageReservationUnscoped(args: {
    turnRequestId: string;
    companyId: string;
    userId: string;
    requiredCredits: number;
  }): Promise<number | null> {
    if (!Number.isSafeInteger(args.requiredCredits) || args.requiredCredits < 1)
      throw new Error("Agent credit reservation extension is invalid.");

    return this.withCompanyTransaction(args.companyId, async () => {
      const reservation = await this.prisma.agentUsageEvent.findFirst({
        where: {
          turnRequestId: args.turnRequestId,
          companyId: args.companyId,
          userId: args.userId,
          state: "reserved",
        },
        select: {
          id: true,
          reservedCredits: true,
          periodStart: true,
          periodEnd: true,
          allowanceCreditsSnapshot: true,
        },
      });
      if (!reservation) return null;
      if (reservation.reservedCredits >= args.requiredCredits) return reservation.reservedCredits;

      const now = new Date();
      const user = await this.findUserForUsageUnscoped(args.userId);
      if (!user || user.companyId !== args.companyId || user.status !== Status.active || !user.subscription)
        return null;
      const entitlement = await this.resolveCurrentAgentCreditEntitlement(user, now);
      if (
        !entitlement ||
        entitlement.blockedReason ||
        entitlement.start.getTime() !== reservation.periodStart.getTime() ||
        entitlement.resetAt.getTime() !== reservation.periodEnd.getTime()
      )
        return null;

      const others = await this.prisma.agentUsageEvent.findMany({
        where: {
          companyId: args.companyId,
          userId: args.userId,
          periodStart: reservation.periodStart,
          periodEnd: reservation.periodEnd,
          state: { in: ["reserved", "settled", "retained"] },
          id: { not: reservation.id },
        },
        select: { state: true, reservedCredits: true, chargedCredits: true },
      });
      const committedElsewhere = sumCommittedAgentCredits(others);
      if (committedElsewhere + args.requiredCredits > entitlement.limit) return null;

      if (
        !(await this.admitsHostedAiGlobalSpend({
          now,
          excludeReservationId: reservation.id,
          additionalReservedCredits: args.requiredCredits,
        }))
      )
        return null;

      const extended = await this.prisma.agentUsageEvent.updateMany({
        where: {
          id: reservation.id,
          companyId: args.companyId,
          state: "reserved",
        },
        data: {
          reservedCredits: args.requiredCredits,
          allowanceCreditsSnapshot: entitlement.limit,
          planSnapshot: entitlement.plan,
          subscriptionStatusSnapshot: user.subscription.status,
        },
      });
      return extended.count === 1 ? args.requiredCredits : null;
    });
  }

  @BypassTenantGuard
  async releaseUsageReservationUnscoped(args: { id: string; companyId: string; userId: string; releasedAt: Date }) {
    const { releasedAt, ...where } = args;
    await this.prisma.agentUsageEvent.updateMany({
      where: { ...where, state: "reserved" },
      data: { state: "released", chargedCredits: 0, settledAt: releasedAt },
    });
  }
}
