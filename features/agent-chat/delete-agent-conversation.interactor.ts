import { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AgentSessionUnavailableError } from "@/core/errors/app-errors";
import type { Data, Validated } from "@/core/validation/validation.utils";

import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

export const DeleteAgentConversationSchema = z.object({ conversationId: z.uuid() });
export type DeleteAgentConversationData = Data<typeof DeleteAgentConversationSchema>;

@AllowInDemoMode
@TenantInteractor()
export class DeleteAgentConversationInteractor extends AuthenticatedInteractor<
  DeleteAgentConversationData,
  { deleted: true }
> {
  constructor(private repo: PrismaAgentChatRepo) {
    super();
  }

  @Validate(DeleteAgentConversationSchema)
  async invoke(data: DeleteAgentConversationData): Validated<{ deleted: true }> {
    const deleted = await this.repo.deleteArchivedConversation(data.conversationId);
    if (!deleted) throw new AgentSessionUnavailableError("Archived conversation not found.");

    return { ok: true as const, data: { deleted: true as const } };
  }
}
