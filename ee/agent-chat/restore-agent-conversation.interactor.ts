import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { z } from "zod";

import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { AgentConversationSummarySchema } from "./agent-chat.schema";
import {
  ArchiveAgentConversationSchema,
  type ArchiveAgentConversationData,
} from "./archive-agent-conversation.interactor";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { createInteractorFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const RestoreAgentConversationResultSchema = z.object({
  activeConversationId: z.string(),
  conversations: z.array(AgentConversationSummarySchema),
  nextCursor: z.string().nullable(),
});

type RestoreAgentConversationResult = Data<typeof RestoreAgentConversationResultSchema>;

@AllowInDemoMode
@TenantInteractor()
export class RestoreAgentConversationInteractor extends AuthenticatedInteractor<
  ArchiveAgentConversationData,
  RestoreAgentConversationResult
> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({
    input: ArchiveAgentConversationSchema,
    output: RestoreAgentConversationResultSchema,
    tx: false,
  })
  async invoke(data: ArchiveAgentConversationData): Validated<RestoreAgentConversationResult> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const restored = await this.repo.restoreConversation(data.conversationId);
    if (!restored) return createInteractorFailure(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

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
