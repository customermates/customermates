import type { Validated } from "@/core/validation/validation.utils";
import type { AgentChatRepo } from "./agent-chat.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { RenameAgentConversationSchema, type RenameAgentConversationData } from "./agent-chat.schema";

@TenantInteractor()
export class RenameAgentConversationInteractor extends AuthenticatedInteractor<
  RenameAgentConversationData,
  { id: string; title: string }
> {
  constructor(private repo: AgentChatRepo) {
    super();
  }

  @Validate(RenameAgentConversationSchema)
  async invoke({ id, title }: RenameAgentConversationData): Validated<{ id: string; title: string }> {
    await this.repo.renameConversation({ id, title });
    return { ok: true as const, data: { id, title } };
  }
}
