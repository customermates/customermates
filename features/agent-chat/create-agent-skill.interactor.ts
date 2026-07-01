import type { Validated } from "@/core/validation/validation.utils";
import type { AgentSkillDto, AgentSkillRepo } from "./agent-skill.repo";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { CreateAgentSkillSchema, type CreateAgentSkillData } from "./agent-skill.schema";

/**
 * Creates a company-scoped agent skill. Skills are company-wide agent config, so
 * this is gated like other company-admin settings (company:update). The companyId
 * always comes from the tenant context in the repo — never from request input.
 */
@TenantInteractor({ resource: Resource.company, action: Action.update })
export class CreateAgentSkillInteractor extends AuthenticatedInteractor<CreateAgentSkillData, AgentSkillDto> {
  constructor(private repo: AgentSkillRepo) {
    super();
  }

  @Validate(CreateAgentSkillSchema)
  async invoke(input: CreateAgentSkillData): Validated<AgentSkillDto> {
    return { ok: true as const, data: await this.repo.create(input) };
  }
}
