import type { Validated } from "@/core/validation/validation.utils";
import type { AgentSkillContent, AgentSkillRepo } from "./agent-skill.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { GetAgentSkillByNameSchema, type GetAgentSkillByNameData } from "./agent-skill.schema";

@AllowInDemoMode
@TenantInteractor()
export class GetAgentSkillByNameInteractor extends AuthenticatedInteractor<
  GetAgentSkillByNameData,
  AgentSkillContent | null
> {
  constructor(private repo: AgentSkillRepo) {
    super();
  }

  @Validate(GetAgentSkillByNameSchema)
  async invoke({ name }: GetAgentSkillByNameData): Validated<AgentSkillContent | null> {
    return { ok: true as const, data: await this.repo.getByName(name) };
  }
}
