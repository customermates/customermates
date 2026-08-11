import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { type Data, type Validated } from "@/core/validation/validation.utils";

import type { AgentUsageService } from "./agent-usage.service";
import { AgentUsageSummarySchema } from "./agent-usage.service";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

import { AgentConversationSummarySchema, AgentDataCountsSchema } from "./agent-chat.schema";
import { laneModelId } from "./llm.service";

const OutputSchema = z.object({
  enabled: z.literal(true),
  usage: AgentUsageSummarySchema,
  unreadSupport: z.number(),
  counts: AgentDataCountsSchema,
  conversationId: z.string().nullable(),
  conversations: z.array(AgentConversationSummarySchema),
  archivedConversations: z.array(AgentConversationSummarySchema),
  conversationNextCursor: z.string().nullable(),
  archivedConversationNextCursor: z.string().nullable(),
});

type AgentConfig = Data<typeof OutputSchema>;

@AllowInDemoMode
@TenantInteractor()
export class GetAgentConfigInteractor extends AuthenticatedInteractor<void, AgentConfig> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private usageService: AgentUsageService,
  ) {
    super();
  }

  @ValidateOutput(OutputSchema)
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
