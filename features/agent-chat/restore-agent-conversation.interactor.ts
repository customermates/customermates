import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import type { Validated } from "@/core/validation/validation.utils";

import type { AgentConversationSummary } from "./agent-chat.schema";
import {
  ArchiveAgentConversationSchema,
  type ArchiveAgentConversationData,
} from "./archive-agent-conversation.interactor";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

type RestoreAgentConversationResult = {
  activeConversationId: string;
  conversations: AgentConversationSummary[];
  nextCursor: string | null;
};

@AllowInDemoMode
@TenantInteractor()
export class RestoreAgentConversationInteractor extends AuthenticatedInteractor<
  ArchiveAgentConversationData,
  RestoreAgentConversationResult
> {
  constructor(private repo: PrismaAgentChatRepo) {
    super();
  }

  @Validate(ArchiveAgentConversationSchema)
  async invoke(data: ArchiveAgentConversationData): Validated<RestoreAgentConversationResult> {
    const restored = await this.repo.restoreConversation(data.conversationId);
    if (!restored) throw new AgentSessionUnavailableError("Archived conversation not found.");

    const page = await this.repo.listConversationPage({ archived: false });
    return {
      ok: true as const,
      data: {
        activeConversationId: data.conversationId,
        conversations: page.conversations,
        nextCursor: page.nextCursor,
      },
    };
  }
}
