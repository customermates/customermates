import type { SupportTicketSource } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

export class PrismaSupportRepo extends BaseRepository {
  async createSupportTicket(args: { subject: string; body: string; source: SupportTicketSource }) {
    return this.prisma.supportTicket.create({
      data: {
        companyId: this.companyId,
        userId: this.userId,
        subject: args.subject,
        body: args.body,
        source: args.source,
      },
      select: { id: true, number: true },
    });
  }
}
