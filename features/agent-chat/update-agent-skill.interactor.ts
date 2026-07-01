import type { Validated } from "@/core/validation/validation.utils";
import type { AgentSkillDto, AgentSkillRepo } from "./agent-skill.repo";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { UpdateAgentSkillSchema, type UpdateAgentSkillData } from "./agent-skill.schema";

/**
 * Updates a company-scoped agent skill. Gated like other company-admin settings
 * (company:update). Tenant-scoped: the repo only touches rows in the caller's
 * company, so an id from another company updates nothing and returns null (the
 * route maps that to 404).
 */
@TenantInteractor({ resource: Resource.company, action: Action.update })
export class UpdateAgentSkillInteractor extends AuthenticatedInteractor<UpdateAgentSkillData, AgentSkillDto | null> {
  constructor(private repo: AgentSkillRepo) {
    super();
  }

  @Validate(UpdateAgentSkillSchema)
  async invoke({ id, ...input }: UpdateAgentSkillData): Validated<AgentSkillDto | null> {
    return { ok: true as const, data: await this.repo.update(id, input) };
  }
}
