import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data, type Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { AgentUsageService } from "./agent-usage.service";
import { AgentUsageSummarySchema } from "./agent-usage.service";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

import { AgentConversationSummarySchema, AgentDataCountsSchema } from "./agent-chat.schema";
import { resolveAgentModel } from "./model-catalog";

const OutputSchema = z.discriminatedUnion("enabled", [
  z.object({ enabled: z.literal(false) }),
  z.object({
    enabled: z.literal(true),
    usage: AgentUsageSummarySchema,
    counts: AgentDataCountsSchema,
    conversationId: z.string().nullable(),
    conversations: z.array(AgentConversationSummarySchema),
    archivedConversations: z.array(AgentConversationSummarySchema),
    conversationNextCursor: z.string().nullable(),
    archivedConversationNextCursor: z.string().nullable(),
  }),
]);

export type AgentConfig = Data<typeof OutputSchema>;

@AllowInDemoMode
@TenantInteractor()
export class GetAgentConfigInteractor extends AuthenticatedInteractor<void, AgentConfig> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private usageService: AgentUsageService,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @ValidateOutput(OutputSchema)
  async invoke(): Validated<AgentConfig> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return { ok: true as const, data: { enabled: false as const } };

    await this.repo.normalizeExpiredAgentRunLease(new Date(), resolveAgentModel().modelId);

    const [usage, counts, conversation, conversationPage, archivedConversationPage] = await Promise.all([
      this.usageService.getUsageSummary(this.userId),
      this.repo.getSuggestionSignals(),
      this.repo.findMyConversation(),
      this.repo.listConversationPage({ archived: false }),
      this.repo.listConversationPage({ archived: true }),
    ]);

    return {
      ok: true as const,
      data: {
        enabled: true as const,
        usage,
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
