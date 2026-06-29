import type { Validated } from "@/core/validation/validation.utils";
import type { AgentChatRepo, AgentConversationSummary, AgentStoredMessage } from "./agent-chat.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { GetAgentConversationSchema, type GetAgentConversationData } from "./agent-chat.schema";

export type GetAgentConversationResult = {
  conversation: AgentConversationSummary | null;
  messages: AgentStoredMessage[];
};

@AllowInDemoMode
@TenantInteractor()
export class GetAgentConversationInteractor extends AuthenticatedInteractor<
  GetAgentConversationData,
  GetAgentConversationResult
> {
  constructor(private repo: AgentChatRepo) {
    super();
  }

  @Validate(GetAgentConversationSchema)
  async invoke({ id }: GetAgentConversationData): Validated<GetAgentConversationResult> {
    const conversation = await this.repo.getConversation(id);
    if (!conversation) return { ok: true as const, data: { conversation: null, messages: [] } };

    const messages = await this.repo.getMessages(id);
    return { ok: true as const, data: { conversation, messages } };
  }
}
