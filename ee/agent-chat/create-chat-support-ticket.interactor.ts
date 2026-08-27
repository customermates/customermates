import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";

import type { FeedbackCreator } from "@/features/feedback/feedback.creator";

import { formatSupportTranscript, SUPPORT_TRANSCRIPT_MESSAGE_LIMIT } from "./agent-chat.schema";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({
  conversationId: z.uuid(),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
});

export type CreateChatSupportTicketData = Data<typeof Schema>;

const OutputSchema = z.object({
  sent: z.literal(true),
});

type SupportRequestResult = Data<typeof OutputSchema>;

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
    input: Schema,
    output: OutputSchema,
    tx: false,
  })
  async invoke(data: CreateChatSupportTicketData): Validated<SupportRequestResult> {
    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) return failNotFound(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

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
