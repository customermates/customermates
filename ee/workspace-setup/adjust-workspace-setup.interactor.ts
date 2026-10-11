import type { Validated } from "@/core/validation/validation.utils";
import type { WorkspaceSetupRepo } from "./workspace-setup.repo";
import type { SaveWorkspaceSetupAnswersData } from "./workspace-setup-input.schema";
import type { PlanWorkspaceSetupInteractor } from "./plan-workspace-setup.interactor";
import type { SaveWorkspaceSetupAnswersInteractor } from "./save-workspace-setup-answers.interactor";

import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Write } from "@/core/decorators/write.decorator";
import { failConflict, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { SaveWorkspaceSetupAnswersSchema } from "./workspace-setup-input.schema";

@TenantInteractor({ resource: Resource.dataModel, manage: "update" })
export class AdjustWorkspaceSetupInteractor extends AuthenticatedInteractor<
  SaveWorkspaceSetupAnswersData,
  { planRevision: number }
> {
  constructor(
    private repo: WorkspaceSetupRepo,
    private save: Pick<SaveWorkspaceSetupAnswersInteractor, "invoke">,
    private plan: Pick<PlanWorkspaceSetupInteractor, "invoke">,
  ) {
    super();
  }

  @Write({ input: SaveWorkspaceSetupAnswersSchema, tx: false })
  async invoke(data: SaveWorkspaceSetupAnswersData): Validated<{ planRevision: number }> {
    const setup = await this.repo.get(data.setupId);
    if (!setup) return failNotFound(CustomErrorCode.workspaceSetupNotFound, ["setupId"]);
    if (setup.status !== "planned") return failConflict(CustomErrorCode.workspaceSetupConflict);
    const saved = await this.save.invoke(data);
    if (!saved.ok) return saved;
    return this.plan.invoke({ setupId: data.setupId });
  }
}
