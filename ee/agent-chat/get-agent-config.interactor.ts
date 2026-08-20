import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { type Data } from "@/core/validation/validation.utils";
import type { EntitlementDenialCode, EntitlementService } from "@/ee/subscription/entitlement.service";

import type { AgentUsageService } from "./agent-usage.service";
import { AgentUsageSummarySchema } from "./agent-usage.service";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

import { AgentConversationSummarySchema, AgentDataCountsSchema } from "./agent-chat.schema";
import { laneModelId } from "./llm.service";

const OutputSchema = z.object({
  usage: AgentUsageSummarySchema,
  counts: AgentDataCountsSchema,
  conversationId: z.string().nullable(),
  conversations: z.array(AgentConversationSummarySchema),
  archivedConversations: z.array(AgentConversationSummarySchema),
  conversationNextCursor: z.string().nullable(),
  archivedConversationNextCursor: z.string().nullable(),
});

type AgentConfig = Data<typeof OutputSchema>;
export type GetAgentConfigInvocationResult =
  | { ok: true; data: AgentConfig }
  | { ok: false; error: z.ZodError; code?: EntitlementDenialCode };

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
  async invoke(): Promise<GetAgentConfigInvocationResult> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    await this.repo.normalizeExpiredAgentRunLease(new Date(), laneModelId("agent"));

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
