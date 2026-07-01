import type { AgentChatRepo, AgentConversationSummary, AgentStoredMessage } from "./agent-chat.repo";

import { Prisma } from "@/generated/prisma";
import { BaseRepository } from "@/core/base/base-repository";

const CONVERSATION_SUMMARY_SELECT = {
  id: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class PrismaAgentChatRepo extends BaseRepository implements AgentChatRepo {
  createConversation({ id, title }: { id?: string; title: string }): Promise<AgentConversationSummary> {
    return this.prisma.agentConversation.create({
      data: {
        ...(id ? { id } : {}),
        companyId: this.companyId,
        userId: this.userId,
        title,
      },
      select: CONVERSATION_SUMMARY_SELECT,
    });
  }

  listConversations(): Promise<AgentConversationSummary[]> {
    return this.prisma.agentConversation.findMany({
      where: { companyId: this.companyId, userId: this.userId },
      orderBy: { updatedAt: "desc" },
      select: CONVERSATION_SUMMARY_SELECT,
    });
  }

  getConversation(id: string): Promise<AgentConversationSummary | null> {
    return this.prisma.agentConversation.findFirst({
      where: { id, companyId: this.companyId, userId: this.userId },
      select: CONVERSATION_SUMMARY_SELECT,
    });
  }

  getMessages(conversationId: string): Promise<AgentStoredMessage[]> {
    return this.prisma.agentMessage.findMany({
      // Defense-in-depth: only messages whose conversation is owned by this user.
      where: { conversationId, companyId: this.companyId, conversation: { userId: this.userId } },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, parts: true, createdAt: true },
    });
  }

  async renameConversation({ id, title }: { id: string; title: string }): Promise<void> {
    await this.prisma.agentConversation.updateMany({
      where: { id, companyId: this.companyId, userId: this.userId },
      data: { title },
    });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.prisma.agentConversation.deleteMany({
      where: { id, companyId: this.companyId, userId: this.userId },
    });
  }

  async saveMessage({
    conversationId,
    id,
    role,
    parts,
  }: {
    conversationId: string;
    id: string;
    role: string;
    parts: unknown;
  }): Promise<void> {
    const json = parts as Prisma.InputJsonValue;
    // Scope the update to this tenant's OWN conversation. A plain upsert keyed on the
    // client-supplied `where: { id }` bypasses the tenant guard (its upsert branch only
    // validates the create/update payloads, not the where), so a caller passing another
    // tenant's message id would silently overwrite and re-stamp that row. updateMany is
    // fully scoped, and a create only runs when no owned row matched — a genuinely new id.
    const updated = await this.prisma.agentMessage.updateMany({
      where: { id, companyId: this.companyId, conversation: { userId: this.userId } },
      data: { role, parts: json },
    });
    if (updated.count > 0) return;
    await this.prisma.agentMessage.create({
      data: { id, companyId: this.companyId, conversationId, role, parts: json },
    });
  }

  async touchConversation(id: string): Promise<void> {
    await this.prisma.agentConversation.updateMany({
      where: { id, companyId: this.companyId, userId: this.userId },
      data: { updatedAt: new Date() },
    });
  }

  async setPreAuthorizedTools(toolNames: string[]): Promise<void> {
    await this.prisma.user.updateMany({
      where: { id: this.userId, companyId: this.companyId },
      data: { preAuthorizedAgentTools: toolNames.length > 0 ? { toolNames } : Prisma.JsonNull },
    });
  }
}
