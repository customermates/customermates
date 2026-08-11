import { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import type { Validated } from "@/core/validation/validation.utils";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const MarkAgentConversationReadSchema = z.object({
  conversationId: z.uuid(),
  observedSupportMessageId: z.uuid().optional(),
});
export type MarkAgentConversationReadData = z.infer<typeof MarkAgentConversationReadSchema>;

const MarkAgentConversationReadResultSchema = z.object({
  marked: z.literal(true),
  unreadSupport: z.boolean(),
  unreadSupportCount: z.number(),
});

@AllowInDemoMode
@TenantInteractor()
export class MarkAgentConversationReadInteractor extends AuthenticatedInteractor<
  MarkAgentConversationReadData,
  { marked: true; unreadSupport: boolean; unreadSupportCount: number }
> {
  constructor(private repo: PrismaAgentChatRepo) {
    super();
  }

  @Write({
    input: MarkAgentConversationReadSchema,
    output: MarkAgentConversationReadResultSchema,
    tx: false,
  })
  async invoke(data: MarkAgentConversationReadData): Validated<{
    marked: true;
    unreadSupport: boolean;
    unreadSupportCount: number;
  }> {
    const conversation = await this.repo.findConversation(data.conversationId);
    if (!conversation) throw new AgentSessionUnavailableError("Conversation not found.");
    const marked = await this.repo.markConversationRead(conversation.id, data.observedSupportMessageId);
    if (!marked) throw new AgentSessionUnavailableError("Observed support message was not found.");
    const [unreadSupport, unreadSupportCount] = await Promise.all([
      this.repo.isConversationSupportUnread(conversation.id),
      this.repo.countUnreadSupport(),
    ]);
    return {
      ok: true,
      data: { marked: true, unreadSupport, unreadSupportCount },
    };
  }
}
