import type { AuthService } from "@/features/auth/auth.service";
import type { ActiveWorkspaceService } from "./active-workspace.service";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { Status } from "@/generated/prisma";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { WorkspaceSummarySchema, type WorkspaceSummary } from "./workspace.schema";

@AllowInDemoMode
@SystemInteractor
export class ListMyWorkspacesInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly workspaces: ActiveWorkspaceService,
    private readonly repo: WorkspaceMembershipRepo,
  ) {}

  @ValidateOutput(WorkspaceSummarySchema)
  async invoke(): Promise<{ ok: true; data: WorkspaceSummary[] }> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return { ok: true, data: [] };

    const current = await this.workspaces.resolveMembership(session);
    const rows = await this.repo.listWorkspaceMembershipsUnscoped(session.user.email);

    return {
      ok: true,
      data: rows.map((row) => {
        const member = row.status === Status.active;
        return {
          companyId: row.companyId,
          name: row.company.name,
          status: row.status,
          roleName: row.role?.name ?? null,
          isAdmin: row.role?.isSystemRole ?? false,
          isCurrent: row.companyId === current?.companyId,
          activeMemberCount: member ? row.company._count.users : null,
          subscription: member ? row.company.subscription : null,
          joinedAt: row.createdAt,
          createdAt: row.company.createdAt,
        };
      }),
    };
  }
}
