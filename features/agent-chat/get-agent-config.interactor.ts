import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { type Validated } from "@/core/validation/validation.utils";

import type { AgentUsageService, AgentUsageSummary } from "./agent-usage.service";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

import type { AgentConversationSummary, AgentDataCounts } from "./agent-chat.schema";
import { laneModelId } from "./llm.service";

type AgentConfig = {
  enabled: true;
  usage: AgentUsageSummary;
  unreadSupport: number;
  counts: AgentDataCounts;
  conversationId: string | null;
  conversations: AgentConversationSummary[];
  archivedConversations: AgentConversationSummary[];
  conversationNextCursor: string | null;
  archivedConversationNextCursor: string | null;
};

@AllowInDemoMode
@TenantInteractor()
export class GetAgentConfigInteractor extends AuthenticatedInteractor<void, AgentConfig> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private usageService: AgentUsageService,
  ) {
    super();
  }

  async invoke(): Validated<AgentConfig> {
    const user = getTenantUser();
    await this.repo.normalizeExpiredAgentRunLease(new Date(), laneModelId("agent"));

    const [usage, unreadSupport, counts, conversation, conversationPage, archivedConversationPage] = await Promise.all([
      this.usageService.getUsageSummary(user.id),
      this.repo.countUnreadSupport(),
      this.repo.getSuggestionSignals(),
      this.repo.findMyConversation(),
      this.repo.listConversationPage({ archived: false }),
      this.repo.listConversationPage({ archived: true }),
    ]);

    return {
      ok: true as const,
      data: {
        enabled: true,
        usage,
        unreadSupport,
        counts,
        conversationId: conversation?.id ?? null,
        conversations: conversationPage.conversations,
        archivedConversations: archivedConversationPage.conversations,
        conversationNextCursor: conversationPage.nextCursor,
        archivedConversationNextCursor: archivedConversationPage.nextCursor,
      },
    };
  }
}
