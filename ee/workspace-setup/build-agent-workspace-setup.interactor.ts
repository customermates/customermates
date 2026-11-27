import type { Validated } from "@/core/validation/validation.utils";
import type { ConfirmWorkspaceSetupInteractor } from "./confirm-workspace-setup.interactor";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupIdData } from "./workspace-setup-input.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";

import { isAgentWorkspaceSetup } from "./start-agent-workspace-setup.interactor";
import { WorkspaceSetupIdSchema } from "./workspace-setup-input.schema";

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class BuildAgentWorkspaceSetupInteractor extends AuthenticatedInteractor<
  WorkspaceSetupIdData,
  { building: boolean }
> {
  constructor(
    private readonly repo: Pick<WorkspaceSetupRepo, "get">,
    private readonly confirm: Pick<ConfirmWorkspaceSetupInteractor, "invoke">,
  ) {
    super();
  }

  @Validate(WorkspaceSetupIdSchema)
  async invoke(data: WorkspaceSetupIdData): Validated<{ building: boolean }> {
    const setup = await this.repo.get(data.setupId);
    if (!setup || !isAgentWorkspaceSetup(setup.interview.followUpQuestions))
      return { ok: true, data: { building: false } };
    if (setup.status !== "planned" || !setup.plan) return { ok: true, data: { building: setup.status === "building" } };
    const confirmed = await this.confirm.invoke({ setupId: setup.id, planRevision: setup.planRevision });
    if (!confirmed.ok) return confirmed;
    return { ok: true, data: { building: true } };
  }
}
