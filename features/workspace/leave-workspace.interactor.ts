import type { Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { LeaveWorkspaceRepo } from "./leave-workspace.repo";
import type { WorkspaceDepartureService } from "./workspace-departure.service";

import { z } from "zod";
import { Status } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { fail, failAuthorization, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

const OutputSchema = z.object({ companyId: z.string() });
type LeaveWorkspaceResult = z.infer<typeof OutputSchema>;

@TenantInteractor()
export class LeaveWorkspaceInteractor extends AuthenticatedInteractor<void, LeaveWorkspaceResult> {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: LeaveWorkspaceRepo,
    private readonly roleRepo: UpdateUserRoleRepo,
    private readonly departure: WorkspaceDepartureService,
  ) {
    super();
  }

  @ValidateOutput(OutputSchema)
  async invoke(): Validated<LeaveWorkspaceResult> {
    const session = await this.authService.getInteractiveSession();
    if (!session || session.user.email !== this.user.email) return failAuthorization(CustomErrorCode.permissionDenied);

    const { companyId, userId } = this;
    const wasActive = this.user.status === Status.active;

    const refusal = await runInTransaction(
      async () => {
        if (await this.repo.isPlatformOperatorCompanyWide(userId))
          return failAuthorization(CustomErrorCode.userPlatformOperatorStatusForbidden);
        if (wasActive && this.user.role?.isSystemRole && !(await this.roleRepo.hasAnotherActiveSystemRoleUser(userId)))
          return fail(CustomErrorCode.workspaceLastAdmin);

        await this.repo.leaveCompanyWide(userId);
        try {
          await this.departure.announce({ id: userId, status: this.user.status });
        } catch (error) {
          return unwoundFailure(error);
        }
        return null;
      },
      { companyId },
    );
    if (refusal) return refusal;

    await this.departure.complete({
      companyId,
      member: { id: userId, email: this.user.email, status: this.user.status },
      loginId: session.user.id,
    });

    return { ok: true as const, data: { companyId } };
  }
}
