import type { Validated } from "@/core/validation/validation.utils";
import type { ConfirmWorkspaceSetupInteractor } from "./confirm-workspace-setup.interactor";
import type { GetWorkspaceSetupStatusInteractor } from "./get-workspace-setup-status.interactor";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupStatusView } from "./workspace-setup-status";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";

import { isAgentWorkspaceSetup } from "./start-agent-workspace-setup.interactor";

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class AdvanceAgentWorkspaceSetupInteractor extends AuthenticatedInteractor<void, WorkspaceSetupStatusView> {
  constructor(
    private readonly repo: Pick<WorkspaceSetupRepo, "findCurrent">,
    private readonly status: Pick<GetWorkspaceSetupStatusInteractor, "invoke">,
    private readonly confirm: Pick<ConfirmWorkspaceSetupInteractor, "invoke">,
  ) {
    super();
  }

  async invoke(): Validated<WorkspaceSetupStatusView> {
    const setup = await this.repo.findCurrent();
    if (setup?.status === "planned" && setup.plan && isAgentWorkspaceSetup(setup.interview.followUpQuestions)) {
      const confirmed = await this.confirm.invoke({ setupId: setup.id, planRevision: setup.planRevision });
      if (!confirmed.ok) return confirmed;
    }
    return this.status.invoke();
  }
}
