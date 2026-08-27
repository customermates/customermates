import { z } from "zod";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import type { Data, Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({ conversationId: z.uuid() });
export type DeleteAgentConversationData = Data<typeof Schema>;

const DeleteAgentConversationResultSchema = z.object({ deleted: z.literal(true) });

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
    input: Schema,
    output: DeleteAgentConversationResultSchema,
    tx: false,
  })
  async invoke(data: DeleteAgentConversationData): Validated<{ deleted: true }> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const deleted = await this.repo.deleteArchivedConversation(data.conversationId);
    if (!deleted) return failNotFound(CustomErrorCode.agentConversationNotFound, ["conversationId"]);

    return { ok: true as const, data: { deleted: true as const } };
  }
}
