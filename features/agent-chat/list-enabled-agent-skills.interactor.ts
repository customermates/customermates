import type { Validated } from "@/core/validation/validation.utils";
import type { AgentSkillCatalogEntry, AgentSkillRepo } from "./agent-skill.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

@AllowInDemoMode
@TenantInteractor()
export class ListEnabledAgentSkillsInteractor extends AuthenticatedInteractor<void, AgentSkillCatalogEntry[]> {
  constructor(private repo: AgentSkillRepo) {
    super();
  }

  async invoke(): Validated<AgentSkillCatalogEntry[]> {
    return { ok: true as const, data: await this.repo.listEnabled() };
  }
}
