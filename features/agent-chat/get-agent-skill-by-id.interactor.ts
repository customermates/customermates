import type { Validated } from "@/core/validation/validation.utils";
import type { AgentSkillDto, AgentSkillRepo } from "./agent-skill.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { AgentSkillIdSchema, type AgentSkillIdData } from "./agent-skill.schema";

/**
 * Loads one skill by id, tenant-scoped (returns null if it belongs to another
 * company or does not exist). Read-only; any authenticated active user may call it.
 */
@AllowInDemoMode
@TenantInteractor()
export class GetAgentSkillByIdInteractor extends AuthenticatedInteractor<AgentSkillIdData, AgentSkillDto | null> {
  constructor(private repo: AgentSkillRepo) {
    super();
  }

  @Validate(AgentSkillIdSchema)
  async invoke({ id }: AgentSkillIdData): Validated<AgentSkillDto | null> {
    return { ok: true as const, data: await this.repo.getById(id) };
  }
}
