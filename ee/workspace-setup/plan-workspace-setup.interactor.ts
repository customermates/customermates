import type { Validated } from "@/core/validation/validation.utils";
import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { WorkspaceSetupIdData } from "./workspace-setup-input.schema";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { fail, failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { WorkspaceSetupIdSchema } from "./workspace-setup-input.schema";
import { workspaceSetupUnavailability } from "./workspace-setup-availability";

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class PlanWorkspaceSetupInteractor extends AuthenticatedInteractor<
  WorkspaceSetupIdData,
  { planRevision: number }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private background: Pick<BackgroundTaskService, "dispatch">,
  ) {
    super();
  }

  @Write({ input: WorkspaceSetupIdSchema, tx: false })
  async invoke(data: WorkspaceSetupIdData): Validated<{ planRevision: number }> {
    if (workspaceSetupUnavailability()) return fail(CustomErrorCode.workspaceSetupUnavailable);
    const queued = await this.repo.mutate(data.setupId, (setup) => {
      if (setup.status !== "interview" && setup.status !== "planned") return null;
      const unanswered = setup.interview.followUpQuestions.some(
        (question) => !setup.interview.followUpAnswers.some((answer) => answer.id === question.id),
      );
      if (unanswered) return null;
      return {
        status: "planning",
        planRevision: setup.planRevision + 1,
        interview: { ...setup.interview, plan: "queued", planError: null, planClaimedAt: null },
      };
    });
    if (!queued) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    if (!queued.changed) return failConflict(CustomErrorCode.workspaceSetupConflict);
    await this.background.dispatch("plan-workspace-setup", { setupId: data.setupId, userId: this.userId });
    return { ok: true, data: { planRevision: queued.setup.planRevision } };
  }
}
