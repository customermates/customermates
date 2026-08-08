import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";

import type { CreateSupportTicketInteractor } from "@/features/support/create-support-ticket.interactor";

import { buildTicketContentFromTranscript } from "./agent-chat.schema";
import { deriveChatSupportTicketId } from "./agent-support-ticket-idempotency";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

const TRANSCRIPT_MESSAGE_LIMIT = 6;

export const CreateChatSupportTicketSchema = z.object({
  conversationId: z.uuid(),
  turnRequestId: z.uuid(),
  toolCallId: z.string().min(1).max(256),
  subject: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(10000).optional(),
});

export type CreateChatSupportTicketData = Data<typeof CreateChatSupportTicketSchema>;

type CreatedTicket = { id: string; number: number };

@TenantInteractor()
export class CreateChatSupportTicketInteractor extends AuthenticatedInteractor<
  CreateChatSupportTicketData,
  CreatedTicket
> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private createSupportTicket: CreateSupportTicketInteractor,
  ) {
    super();
  }

  @Validate(CreateChatSupportTicketSchema)
  async invoke(data: CreateChatSupportTicketData): Validated<CreatedTicket> {
    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) throw new AgentSessionUnavailableError("Conversation not found.");
    const { subject, body } = await this.resolveContent(data, conversation.id);

    const ticket = await this.createSupportTicket.invoke({
      subject,
      body,
      source: "chat",
      agentConversationId: conversation.id,
      idempotencyId: deriveChatSupportTicketId({
        turnRequestId: data.turnRequestId,
        toolCallId: data.toolCallId,
      }),
    });
    if (!ticket.ok) return ticket;

    return { ok: true as const, data: ticket.data };
  }

  private async resolveContent(data: CreateChatSupportTicketData, conversationId: string | null) {
    if (data.subject && data.body) return { subject: data.subject, body: data.body };

    const messages = conversationId ? await this.repo.listRecentMessages(conversationId, TRANSCRIPT_MESSAGE_LIMIT) : [];
    const derived = buildTicketContentFromTranscript(messages);

    return {
      subject: data.subject ?? derived.subject,
      body: data.body ?? derived.body,
    };
  }
}
