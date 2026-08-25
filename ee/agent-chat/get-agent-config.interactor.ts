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
import { agentModelOptions, resolveAgentModel } from "./model-catalog";
import { agentRoundWorstCaseCredits } from "./agent-budget-policy";

const AgentModelOptionSchema = z.object({
  key: z.string(),
  costBand: z.number().int().positive(),
  isDefault: z.boolean(),
  speeds: z.array(z.string()),
  defaultSpeed: z.string().nullable(),
});

const OutputSchema = z.object({
  models: z.array(AgentModelOptionSchema),
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
        usage,
        counts,
        models: agentModelOptions(agentRoundWorstCaseCredits),
        conversationId: conversation?.id ?? null,
        conversations: conversationPage.conversations,
        archivedConversations: archivedConversationPage.conversations,
        conversationNextCursor: conversationPage.nextCursor,
        archivedConversationNextCursor: archivedConversationPage.nextCursor,
      },
    };
  }
}
