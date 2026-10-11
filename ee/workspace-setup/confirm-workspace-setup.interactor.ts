import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { ConfirmWorkspaceSetupData } from "./workspace-setup-input.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { WORKSPACE_SETUP_PHASES } from "./workspace-setup.schema";
import { ConfirmWorkspaceSetupSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";
import { emptySetupPhase } from "./workspace-setup-build.service";

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class ConfirmWorkspaceSetupInteractor extends AuthenticatedInteractor<
  ConfirmWorkspaceSetupData,
  { setupId: string }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  @Write({ input: ConfirmWorkspaceSetupSchema, tx: false })
  async invoke(data: ConfirmWorkspaceSetupData): Validated<{ setupId: string }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const confirmed = await this.repo.mutate(data.setupId, (setup) => {
      if (setup.status !== "planned" || !setup.plan || setup.planRevision !== data.planRevision) return null;
      return {
        status: "building",
        confirmedAt: new Date(),
        phases: Object.fromEntries(WORKSPACE_SETUP_PHASES.map((phase) => [phase, emptySetupPhase()])),
      };
    });
    if (!confirmed) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    if (!confirmed.changed) {
      if (confirmed.setup.status === "building" && confirmed.setup.planRevision === data.planRevision)
        return { ok: true, data: { setupId: data.setupId } };
      return failConflict(CustomErrorCode.workspaceSetupConflict);
    }
    await this.background.dispatch("build-workspace-setup", { setupId: data.setupId, userId: this.userId });
    return { ok: true, data: { setupId: data.setupId } };
  }
}
