import type { Validated } from "@/core/validation/validation.utils";
import type { AgentSkillRepo } from "./agent-skill.repo";

import { Resource, Action } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { Validate } from "@/core/decorators/validate.decorator";

import { AgentSkillIdSchema, type AgentSkillIdData } from "./agent-skill.schema";

/**
 * Deletes a company-scoped agent skill. Gated like other company-admin settings
 * (company:update). Tenant-scoped: the repo deleteMany is filtered by companyId,
 * so an id from another company is a no-op. Returns the id for the caller.
 */
@TenantInteractor({ resource: Resource.company, action: Action.update })
export class DeleteAgentSkillInteractor extends AuthenticatedInteractor<AgentSkillIdData, { id: string }> {
  constructor(private repo: AgentSkillRepo) {
    super();
  }

  @Validate(AgentSkillIdSchema)
  async invoke({ id }: AgentSkillIdData): Validated<{ id: string }> {
    await this.repo.delete(id);
    return { ok: true as const, data: { id } };
  }
}
