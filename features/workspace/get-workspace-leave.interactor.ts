import type { Data, Validated } from "@/core/validation/validation.utils";
import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { LeaveWorkspaceRepo } from "./leave-workspace.repo";

import { z } from "zod";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { WORKSPACE_LEAVE_REFUSALS, workspaceLeaveRefusal } from "./member-removal-refusal";

const OutputSchema = z.object({
  companyId: z.string(),
  refusal: z.enum(WORKSPACE_LEAVE_REFUSALS).nullable(),
});
export type WorkspaceLeave = Data<typeof OutputSchema>;

@AllowInDemoMode
@TenantInteractor()
export class GetWorkspaceLeaveInteractor extends AuthenticatedInteractor<void, WorkspaceLeave> {
  constructor(
    private readonly repo: LeaveWorkspaceRepo,
    private readonly roleRepo: UpdateUserRoleRepo,
  ) {
    super();
  }

  @ValidateOutput(OutputSchema)
  async invoke(): Validated<WorkspaceLeave> {
    const refusal = await workspaceLeaveRefusal(this.user, { members: this.repo, roles: this.roleRepo });

    return { ok: true as const, data: { companyId: this.companyId, refusal } };
  }
}
