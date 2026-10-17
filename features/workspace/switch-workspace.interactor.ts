import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { z } from "zod";

import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const Schema = z.object({ companyId: z.uuid() });
export type SwitchWorkspaceData = Data<typeof Schema>;

const OutputSchema = z.object({ companyId: z.string() });
type SwitchWorkspaceResult = Data<typeof OutputSchema>;

@AllowInDemoMode
@SystemInteractor
export class SwitchWorkspaceInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: WorkspaceMembershipRepo,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: SwitchWorkspaceData): Validated<SwitchWorkspaceResult> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return failAuthorization(CustomErrorCode.permissionDenied);

    const membership = await this.repo.findMembershipUnscoped(session.user.email, data.companyId);
    if (!membership) return failNotFound(CustomErrorCode.workspaceNotFound, ["companyId"]);

    await this.authService.setSessionActiveCompany(session.session.id, membership.companyId);
    await this.repo.setLastUsedCompanyUnscoped(session.user.id, membership.companyId);
    await this.repo.markMembershipActiveUnscoped(session.user.email, membership.companyId);

    return { ok: true as const, data: { companyId: membership.companyId } };
  }
}
