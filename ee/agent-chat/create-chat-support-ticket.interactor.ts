import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";

import type { FeedbackCreator } from "@/features/feedback/feedback.creator";

import { formatSupportTranscript, SUPPORT_TRANSCRIPT_MESSAGE_LIMIT } from "./agent-chat.schema";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const CreateChatSupportTicketSchema = z.object({
  conversationId: z.uuid(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export type CreateChatSupportTicketData = Data<typeof CreateChatSupportTicketSchema>;

const OutputSchema = z.object({
  sent: z.literal(true),
});

type SupportRequestResult = Data<typeof OutputSchema>;

@AllowInDemoMode
@TenantInteractor()
export class CreateChatSupportTicketInteractor extends AuthenticatedInteractor<
  CreateChatSupportTicketData,
  SupportRequestResult
> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private feedbackCreator: FeedbackCreator,
  ) {
    super();
  }

  @Write({
    input: CreateChatSupportTicketSchema,
    output: OutputSchema,
    tx: false,
  })
  async invoke(data: CreateChatSupportTicketData): Validated<SupportRequestResult> {
    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) throw new Error("Conversation not found.");

    const messages = await this.repo.listRecentMessages(conversation.id, SUPPORT_TRANSCRIPT_MESSAGE_LIMIT);
    const transcript = formatSupportTranscript(messages);
    const details = transcript ? `${data.body}\n\nRecent Assistant conversation:\n${transcript}` : data.body;

    await this.feedbackCreator.create({
      details,
      subject: `Support request: ${data.subject}`,
      user: this.user,
    });

    return { ok: true as const, data: { sent: true as const } };
  }
}
