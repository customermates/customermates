import { SupportTicketSource } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

export class PrismaSupportRepo extends BaseRepository {
  async createSupportTicketOrThrow(args: {
    subject: string;
    body: string;
    source: SupportTicketSource;
    idempotencyId?: string;
    agentConversationId?: string;
  }) {
    if (args.agentConversationId && args.source !== SupportTicketSource.chat)
      throw new Error("Only hosted Assistant tickets can reference a conversation.");

    const findExisting = () =>
      args.idempotencyId
        ? this.prisma.supportTicket.findFirst({
            where: {
              id: args.idempotencyId,
              companyId: this.companyId,
              userId: this.userId,
            },
            select: { id: true, number: true },
          })
        : Promise.resolve(null);

    const existingBeforeCreate = await findExisting();
    if (existingBeforeCreate) return { ...existingBeforeCreate, created: false as const };

    if (args.agentConversationId) {
      const conversation = await this.prisma.agentConversation.findFirst({
        where: {
          id: args.agentConversationId,
          companyId: this.companyId,
          userId: this.userId,
        },
        select: { id: true },
      });
      if (!conversation) throw new Error("Hosted Assistant conversation not found for support ticket.");
    }

    try {
      const ticket = await this.prisma.supportTicket.create({
        data: {
          ...(args.idempotencyId ? { id: args.idempotencyId } : {}),
          companyId: this.companyId,
          userId: this.userId,
          subject: args.subject,
          body: args.body,
          source: args.source,
          agentConversationId: args.agentConversationId ?? null,
        },
        select: { id: true, number: true },
      });
      return { ...ticket, created: true as const };
    } catch (error) {
      if (!args.idempotencyId) throw error;

      const existing = await findExisting();
      if (existing) return { ...existing, created: false as const };

      throw error;
    }
  }
}
