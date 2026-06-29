import type { Validated } from "@/core/validation/validation.utils";
import type { AgentChatRepo, AgentConversationSummary } from "./agent-chat.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

@AllowInDemoMode
@TenantInteractor()
export class ListAgentConversationsInteractor extends AuthenticatedInteractor<void, AgentConversationSummary[]> {
  constructor(private repo: AgentChatRepo) {
    super();
  }

  async invoke(): Validated<AgentConversationSummary[]> {
    return { ok: true as const, data: await this.repo.listConversations() };
  }
}
