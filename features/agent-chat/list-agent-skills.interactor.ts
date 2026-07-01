import type { Validated } from "@/core/validation/validation.utils";
import type { AgentSkillDto, AgentSkillRepo } from "./agent-skill.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

/**
 * Lists every skill for the company (enabled or not) for the admin settings UI.
 * Read-only, so any authenticated active user in the tenant may call it; writes
 * are gated separately (see create/update/delete interactors).
 */
@AllowInDemoMode
@TenantInteractor()
export class ListAgentSkillsInteractor extends AuthenticatedInteractor<void, AgentSkillDto[]> {
  constructor(private repo: AgentSkillRepo) {
    super();
  }

  async invoke(): Validated<AgentSkillDto[]> {
    return { ok: true as const, data: await this.repo.listAll() };
  }
}
