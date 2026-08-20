import { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const DeleteAgentConversationSchema = z.object({ conversationId: z.uuid() });
export type DeleteAgentConversationData = Data<typeof DeleteAgentConversationSchema>;

const DeleteAgentConversationResultSchema = z.object({ deleted: z.literal(true) });

@AllowInDemoMode
@TenantInteractor()
export class DeleteAgentConversationInteractor extends AuthenticatedInteractor<
  DeleteAgentConversationData,
  { deleted: true }
> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Write({
    input: DeleteAgentConversationSchema,
    output: DeleteAgentConversationResultSchema,
    tx: false,
  })
  async invoke(data: DeleteAgentConversationData): Validated<{ deleted: true }> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const deleted = await this.repo.deleteArchivedConversation(data.conversationId);
    if (!deleted) throw new AgentSessionUnavailableError("Archived conversation not found.");

    return { ok: true as const, data: { deleted: true as const } };
  }
}
