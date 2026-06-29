import type { Validated } from "@/core/validation/validation.utils";
import type { AgentChatRepo } from "./agent-chat.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { SetPreAuthorizedToolsSchema, type SetPreAuthorizedToolsData } from "./agent-chat.schema";

@TenantInteractor()
export class SetPreAuthorizedToolsInteractor extends AuthenticatedInteractor<
  SetPreAuthorizedToolsData,
  { toolNames: string[] }
> {
  constructor(private repo: AgentChatRepo) {
    super();
  }

  @Validate(SetPreAuthorizedToolsSchema)
  async invoke({ toolNames }: SetPreAuthorizedToolsData): Validated<{ toolNames: string[] }> {
    const unique = [...new Set(toolNames)];
    await this.repo.setPreAuthorizedTools(unique);
    return { ok: true as const, data: { toolNames: unique } };
  }
}
