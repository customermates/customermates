import { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import { AgentConversationSummarySchema } from "./agent-chat.schema";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { createInteractorFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

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
  constructor(
    private repo: PrismaAgentChatRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({
    input: ArchiveAgentConversationSchema,
    output: ArchiveAgentConversationResultSchema,
    tx: false,
  })
  async invoke(data: ArchiveAgentConversationData): Validated<ArchiveAgentConversationResult> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const archived = await this.repo.archiveConversation(data.conversationId);
    if (!archived) return createInteractorFailure(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

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
