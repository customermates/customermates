import { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { RequiresAgentChat } from "./agent-availability";
import { AgentConversationSummarySchema } from "./agent-chat.schema";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const ArchiveAgentConversationSchema = z.object({
  conversationId: z.uuid(),
});
export type ArchiveAgentConversationData = Data<typeof ArchiveAgentConversationSchema>;

const ArchiveAgentConversationResultSchema = z.object({
  activeConversationId: z.string().nullable(),
  conversations: z.array(AgentConversationSummarySchema),
  nextCursor: z.string().nullable(),
});

type ArchiveAgentConversationResult = Data<typeof ArchiveAgentConversationResultSchema>;

@AllowInDemoMode
@TenantInteractor()
export class ArchiveAgentConversationInteractor extends AuthenticatedInteractor<
  ArchiveAgentConversationData,
  ArchiveAgentConversationResult
> {
  constructor(private repo: PrismaAgentChatRepo) {
    super();
  }

  @Write({
    input: ArchiveAgentConversationSchema,
    output: ArchiveAgentConversationResultSchema,
    tx: false,
  })
  @RequiresAgentChat
  async invoke(data: ArchiveAgentConversationData): Validated<ArchiveAgentConversationResult> {
    const archived = await this.repo.archiveConversation(data.conversationId);
    if (!archived) throw new AgentSessionUnavailableError("Conversation not found.");

    const [page, selected] = await Promise.all([
      this.repo.listConversationPage({ archived: false }),
      this.repo.findMyConversation(),
    ]);
    return {
      ok: true as const,
      data: {
        activeConversationId: selected?.id ?? null,
        conversations: page.conversations,
        nextCursor: page.nextCursor,
      },
    };
  }
}
