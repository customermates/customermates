import type { AuthService } from "@/features/auth/auth.service";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { Status } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { WorkspaceLeaveSchema, type WorkspaceLeave } from "./get-workspace-leave.interactor";
import { workspaceLeaveRefusal } from "./member-removal-refusal";

@AllowInDemoMode
@SystemInteractor
export class ListWorkspaceLeavesInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly memberships: WorkspaceMembershipRepo,
  ) {}

  @ValidateOutput(WorkspaceLeaveSchema)
  async invoke(): Promise<{ ok: true; data: WorkspaceLeave[] }> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return { ok: true, data: [] };

    const rows = await this.memberships.listWorkspaceMembershipsUnscoped(session.user.email);
    const leaves: WorkspaceLeave[] = [];

    for (const { id, companyId, status, role } of rows) {
      if (status !== Status.active) continue;

      const refusal = await workspaceLeaveRefusal(
        { id, status, role },
        {
          members: {
            strandsLastPlatformOperatorCompanyWide: () =>
              this.memberships.strandsLastPlatformOperatorUnscoped({ id, companyId }),
          },
          roles: {
            hasAnotherActiveSystemRoleUser: async () =>
              (await this.memberships.listActiveAdminIdsUnscoped(companyId)).some((adminId) => adminId !== id),
          },
        },
      );
      leaves.push({ companyId, refusal });
    }

    return { ok: true, data: leaves };
  }
}
