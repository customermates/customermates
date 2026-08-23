import { randomUUID } from "node:crypto";

import {
  AgentApprovalDecision,
  AgentMessageRole,
  Resource,
  Status,
  type Prisma,
  type SubscriptionPlan,
  type SubscriptionStatus,
} from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { env } from "@/env";

import type { AgentUsageRepo } from "./agent-usage.service";
import { AGENT_CONVERSATION_PAGE_SIZE, AGENT_MESSAGE_PAGE_SIZE, type AgentConversationPage } from "./agent-history";
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
import { resolveAgentCreditEntitlement } from "./agent-credit-policy";

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
  conversationId: string | null;
  title: string | null;
  runId: string;
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

export class PrismaAgentChatRepo extends BaseRepository implements AgentUsageRepo {
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
        data: { expiresAt: new Date(admittedAt.getTime() + AGENT_RUN_LEASE_MS) },
      });
      if (renewedLease.count !== 1) throw new Error("Agent run lease expired before admission.");

      const reservation = await this.prisma.agentUsageEvent.findFirst({
        where: {
          id: args.runId,
          companyId,
          userId,
          state: "reserved",
          providerStartedAt: null,
        },
        select: { id: true },
      });
      if (!reservation) throw new Error("Agent usage reservation is missing before admission.");

      let conversationId = args.conversationId;
      if (conversationId) {
        const conversation = await this.prisma.agentConversation.findFirst({
          where: { id: conversationId, companyId, userId, archivedAt: null },
          select: { id: true },
        });
        if (!conversation) throw new Error("Conversation not found.");
      } else {
        if (args.turn.kind === "retry") throw new Error("Conversation not found.");
        const conversation = await this.prisma.agentConversation.create({
          data: {
            companyId,
            userId,
            title: sanitizeAgentConversationTitle(args.title),
            selectedAt: admittedAt,
          },
          select: { id: true },
        });
        conversationId = conversation.id;
      }

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
    const [contact, organization, deal, service, task, connectedAccount] = await Promise.all([
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
        conversation: { userId: this.userId, companyId: this.companyId, archivedAt: null },
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
      select: { id: true, toolName: true },
    });
    const parsed = pending ? parsePendingAgentApprovalToolName(pending.toolName) : null;
    if (!pending || !parsed) return null;

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
    return resolved.count === 1 ? { toolName: parsed.toolName, resolved: true as const } : null;
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
          id: row.runId,
          companyId: this.companyId,
          userId: this.userId,
          state: "reserved",
        },
        select: { reservedCredits: true },
      });
      if (!reservation) throw new Error("Interrupted agent usage reservation is missing.");
      const settled = await this.prisma.agentUsageEvent.updateMany({
        where: {
          id: row.runId,
          companyId: this.companyId,
          userId: this.userId,
          state: "reserved",
        },
        data: {
          state: "retained",
          model: row.modelSpec ?? model,
          chargedCredits: reservation.reservedCredits,
          settledAt: now,
        },
      });
      if (settled.count !== 1) throw new Error("Interrupted agent usage reservation could not be settled.");
    } else {
      const released = await this.prisma.agentUsageEvent.updateMany({
        where: {
          id: row.runId,
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
    const lease = await this.prisma.agentRunLease.findFirst({
      where: {
        companyId: this.companyId,
        userId: this.userId,
        expiresAt: { lte: now },
      },
      select: { runId: true, expiresAt: true },
    });
    if (!lease) return;

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
        id: lease.runId,
        companyId: this.companyId,
        userId: this.userId,
        state: "reserved",
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
      hasRenderableAgentMessageParts(clientSafeAgentMessageParts(assistantMessage.parts, { sanitizeText: true }));
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

  async claimAgentRunLease(runId: string, expiresAt: Date) {
    const claimed = await this.prisma.agentRunLease.createMany({
      data: [{ userId: this.userId, companyId: this.companyId, runId, expiresAt }],
      skipDuplicates: true,
    });
    return claimed.count === 1;
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
      const entitlement = resolveAgentCreditEntitlement({
        appMode: env.APP_MODE,
        plan: user.subscription.plan,
        status: user.subscription.status,
        trialEndDate: user.subscription.trialEndDate,
        creditAnchorAt: user.subscription.agentCreditAnchorAt ?? user.subscription.createdAt,
        enterpriseCreditsPerUser: user.subscription.enterpriseAgentCreditsPerUser,
        activeSeatAt: user.agentCreditActivatedAt,
        now: startedAt,
      });
      if (entitlement.blockedReason) throw new Error(`Agent credits are blocked: ${entitlement.blockedReason}.`);
      const reservation = await this.prisma.agentUsageEvent.findFirst({
        where: { id: args.runId, companyId: args.companyId, userId: args.userId, state: "reserved" },
        select: { reservedCredits: true },
      });
      if (!reservation) throw new Error("Agent usage reservation is missing at provider start.");
      const currentEvents = await this.prisma.agentUsageEvent.findMany({
        where: {
          id: { not: args.runId },
          userId: args.userId,
          periodStart: entitlement.start,
          periodEnd: entitlement.resetAt,
          state: { in: ["reserved", "settled", "retained"] },
        },
        select: { state: true, reservedCredits: true, chargedCredits: true },
      });
      const usedCredits = currentEvents.reduce(
        (total, event) => total + (event.state === "reserved" ? event.reservedCredits : event.chargedCredits),
        0,
      );
      if (usedCredits + reservation.reservedCredits > entitlement.limit)
        throw new Error("Agent credit allowance changed before the provider started.");

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
          id: args.runId,
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
    const safeParts = clientSafeAgentMessageParts(args.parts, { sanitizeText: true });
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
        settlement.chargedCredits < 1 ||
        settlement.chargedCredits > settlement.reservedCredits ||
        (settlement.state !== "settled" && settlement.state !== "retained") ||
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
            id: args.runId,
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
            chargedCredits: settlement.chargedCredits,
            policyBreach: settlement.policyBreach,
            settledAt: committedAt,
          },
        });
        if (settled.count !== 1) throw new Error("Agent usage reservation could not be settled.");
      } else {
        const released = await this.prisma.agentUsageEvent.updateMany({
          where: {
            id: args.runId,
            companyId: args.companyId,
            userId: args.userId,
            state: "reserved",
          },
          data: { state: "released", chargedCredits: 0, settledAt: committedAt },
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
  async releasePreProviderAdmissionOrThrowUnscoped(args: { userId: string; companyId: string; runId: string }) {
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
        where: { id: args.runId, companyId: args.companyId, userId: args.userId },
        select: { state: true, providerStartedAt: true },
      });
      if (usage && (usage.state === "settled" || usage.state === "retained" || usage.providerStartedAt !== null))
        throw new Error("Agent usage has provider-start evidence and cannot be released.");

      if (usage?.state === "reserved") {
        const released = await this.prisma.agentUsageEvent.updateMany({
          where: {
            id: args.runId,
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
        where: { companyId: args.companyId, userId: args.userId, runId: args.runId },
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
        where: { companyId, userId, periodStart, periodEnd, state: { in: ["settled", "retained"] } },
        orderBy: [{ settledAt: "desc" }, { id: "desc" }],
        select: { chargedCredits: true },
      }),
    ]);

    return {
      usedCredits: events.reduce(
        (total, event) => total + (event.state === "reserved" ? event.reservedCredits : event.chargedCredits),
        0,
      ),
      recentTurnCredits: recent?.chargedCredits ?? null,
    };
  }

  @BypassTenantGuard
  async findUserForUsageUnscoped(userId: string) {
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

    await this.withCompanyTransaction(event.companyId, async () => {
      const reservedAt = new Date();
      const user = await this.findUserForUsageUnscoped(event.userId);
      if (!user || user.companyId !== event.companyId || user.status !== Status.active || !user.subscription)
        throw new Error("Agent credit seat is unavailable.");

      const entitlement = resolveAgentCreditEntitlement({
        appMode: env.APP_MODE,
        plan: user.subscription.plan,
        status: user.subscription.status,
        trialEndDate: user.subscription.trialEndDate,
        creditAnchorAt: user.subscription.agentCreditAnchorAt ?? user.subscription.createdAt,
        enterpriseCreditsPerUser: user.subscription.enterpriseAgentCreditsPerUser,
        activeSeatAt: user.agentCreditActivatedAt,
        now: reservedAt,
      });
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
      const used = existing.reduce(
        (total, item) => total + (item.state === "reserved" ? item.reservedCredits : item.chargedCredits),
        0,
      );
      if (used + event.reservedCredits > entitlement.limit)
        throw new Error("Agent credit reservation exceeds the current allowance.");

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
