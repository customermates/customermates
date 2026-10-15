import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { z } from "zod";
import { Status } from "@/generated/prisma";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failAuthorization, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { nextLastUsedCompanyId } from "./next-last-used-workspace";

const Schema = z.object({ companyId: z.string().min(1) });
export type WithdrawWorkspaceRequestData = Data<typeof Schema>;

const OutputSchema = z.object({ companyId: z.string() });
type WithdrawWorkspaceRequestResult = Data<typeof OutputSchema>;

@SystemInteractor
export class WithdrawWorkspaceRequestInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: WorkspaceMembershipRepo,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: WithdrawWorkspaceRequestData): Validated<WithdrawWorkspaceRequestResult> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return failAuthorization(CustomErrorCode.permissionDenied);

    const membership = await this.repo.findMembershipUnscoped(session.user.email, data.companyId);
    if (membership?.status !== Status.pendingAuthorization)
      return failNotFound(CustomErrorCode.workspaceNotFound, ["companyId"]);
    if (!(await this.repo.withdrawPendingMembershipUnscoped(session.user.email, data.companyId)))
      return failNotFound(CustomErrorCode.workspaceNotFound, ["companyId"]);

    await this.authService.revokeMembershipCredentials(session.user.id, data.companyId);
    if ((await this.repo.findAuthUserCompanyIdUnscoped(session.user.id)) === data.companyId) {
      const memberships = await this.repo.listWorkspaceMembershipsUnscoped(session.user.email);
      await this.repo.setLastUsedCompanyUnscoped(session.user.id, nextLastUsedCompanyId(memberships, data.companyId));
    }

    return { ok: true as const, data: { companyId: data.companyId } };
  }
}
