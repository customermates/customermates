import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";

import type { CreateSupportTicketInteractor } from "@/features/support/create-support-ticket.interactor";

import { formatSupportTranscript, SUPPORT_TRANSCRIPT_MESSAGE_LIMIT } from "./agent-chat.schema";
import { deriveChatSupportTicketId } from "./agent-support-ticket-idempotency";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const CreateChatSupportTicketSchema = z.object({
  conversationId: z.uuid(),
  turnRequestId: z.uuid(),
  toolCallId: z.string().min(1).max(256),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export type CreateChatSupportTicketData = Data<typeof CreateChatSupportTicketSchema>;

const OutputSchema = z.object({
  id: z.string(),
  number: z.number().int(),
});

type CreatedTicket = Data<typeof OutputSchema>;

@AllowInDemoMode
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

  @Write({ input: CreateChatSupportTicketSchema, output: OutputSchema, tx: false })
  async invoke(data: CreateChatSupportTicketData): Validated<CreatedTicket> {
    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) throw new AgentSessionUnavailableError("Conversation not found.");

    const messages = await this.repo.listRecentMessages(conversation.id, SUPPORT_TRANSCRIPT_MESSAGE_LIMIT);

    const ticket = await this.createSupportTicket.invoke({
      subject: data.subject,
      body: data.body,
      transcript: formatSupportTranscript(messages),
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
}
