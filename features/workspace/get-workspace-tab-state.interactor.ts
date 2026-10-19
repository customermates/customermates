import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { RouteGuardCompanyRepo } from "@/features/auth/route-guard-company.repo";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failConflict } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({ companyId: z.uuid() });
export type GetWorkspaceTabStateData = Data<typeof Schema>;

export const WORKSPACE_TAB_STATES = ["current", "deleted"] as const;
export type WorkspaceTabState = (typeof WORKSPACE_TAB_STATES)[number];

const OutputSchema = z.object({ state: z.enum(WORKSPACE_TAB_STATES) });
type GetWorkspaceTabStateResult = Data<typeof OutputSchema>;

@AllowInDemoMode
@SystemInteractor
export class GetWorkspaceTabStateInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly memberships: Pick<WorkspaceMembershipRepo, "findMembershipUnscoped">,
    private readonly companies: Pick<RouteGuardCompanyRepo, "existsUnscoped">,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: GetWorkspaceTabStateData): Validated<GetWorkspaceTabStateResult> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return { ok: true as const, data: { state: "current" as const } };

    const binding = await this.authService.getCredentialWorkspace(session);
    if (
      binding.companyId === data.companyId &&
      (await this.memberships.findMembershipUnscoped(session.user.email, data.companyId))
    )
      return { ok: true as const, data: { state: "current" as const } };

    if (await this.companies.existsUnscoped(data.companyId))
      return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);

    return { ok: true as const, data: { state: "deleted" as const } };
  }
}
