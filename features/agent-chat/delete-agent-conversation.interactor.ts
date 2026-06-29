import type { Validated } from "@/core/validation/validation.utils";
import type { AgentChatRepo } from "./agent-chat.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { DeleteAgentConversationSchema, type DeleteAgentConversationData } from "./agent-chat.schema";

@TenantInteractor()
export class DeleteAgentConversationInteractor extends AuthenticatedInteractor<
  DeleteAgentConversationData,
  { id: string }
> {
  constructor(private repo: AgentChatRepo) {
    super();
  }

  @Validate(DeleteAgentConversationSchema)
  async invoke({ id }: DeleteAgentConversationData): Validated<{ id: string }> {
    await this.repo.deleteConversation(id);
    return { ok: true as const, data: { id } };
  }
}
