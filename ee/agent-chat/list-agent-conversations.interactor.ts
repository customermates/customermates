import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import type { Validated } from "@/core/validation/validation.utils";
import type { EntitlementService } from "@/ee/subscription/entitlement.service";

import {
  AgentConversationHistoryResultSchema,
  type AgentConversationHistoryResult,
  type ListAgentConversationsData,
  ListAgentConversationsSchema,
} from "./agent-history";
import type { PrismaAgentChatRepo } from "./prisma-agent-chat.repository";

@AllowInDemoMode
@TenantInteractor()
export class ListAgentConversationsInteractor extends AuthenticatedInteractor<
  ListAgentConversationsData,
  AgentConversationHistoryResult
> {
  constructor(
    private repo: PrismaAgentChatRepo,
    private entitlements: EntitlementService,
  ) {
    super();
  }

  @Validate(ListAgentConversationsSchema)
  @ValidateOutput(AgentConversationHistoryResultSchema)
  async invoke(data: ListAgentConversationsData): Validated<AgentConversationHistoryResult> {
    const denied = await this.entitlements.require("agentChat");
    if (denied) return denied;

    const [active, archived] = await Promise.all([
      data.kind === "archived" ? null : this.repo.listConversationPage({ archived: false, cursor: data.cursor }),
      data.kind === "active" ? null : this.repo.listConversationPage({ archived: true, cursor: data.cursor }),
    ]);
    return {
      ok: true as const,
      data: { active, archived },
    };
  }
}
