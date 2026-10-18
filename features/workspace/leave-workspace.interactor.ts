import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { LeaveWorkspaceRepo } from "./leave-workspace.repo";
import type { WorkspaceDepartureService } from "./workspace-departure.service";

import { z } from "zod";
import { Status } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { fail, failAuthorization, failConflict, unwoundFailure } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { workspaceLeaveRefusal } from "./member-removal-refusal";

const Schema = z.object({ companyId: z.uuid() });
export type LeaveWorkspaceData = Data<typeof Schema>;

const OutputSchema = z.object({ companyId: z.string() });
type LeaveWorkspaceResult = Data<typeof OutputSchema>;

@TenantInteractor()
export class LeaveWorkspaceInteractor extends AuthenticatedInteractor<LeaveWorkspaceData, LeaveWorkspaceResult> {
  constructor(
    private readonly authService: AuthService,
    private readonly repo: LeaveWorkspaceRepo,
    private readonly roleRepo: UpdateUserRoleRepo,
    private readonly departure: WorkspaceDepartureService,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: LeaveWorkspaceData): Validated<LeaveWorkspaceResult> {
    if (data.companyId !== this.companyId) return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);

    const session = await this.authService.getInteractiveSession();
    if (!session || session.user.email !== this.user.email) return failAuthorization(CustomErrorCode.permissionDenied);

    const { companyId, userId } = this;

    const left = await runInTransaction(
      async () => {
        const member = await this.repo.findMemberCompanyWide({ id: userId });
        if (!member || member.leftAt || member.status !== Status.active)
          return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);

        const blocked = await workspaceLeaveRefusal(member, { members: this.repo, roles: this.roleRepo });
        if (blocked === "platformOperator")
          return failAuthorization(CustomErrorCode.userPlatformOperatorStatusForbidden);
        if (blocked === "lastAdmin") return fail(CustomErrorCode.workspaceLastAdmin);

        if (!(await this.repo.leaveCompanyWide(userId)))
          return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);
        try {
          await this.departure.announce(member);
        } catch (error) {
          return unwoundFailure(error);
        }
        return { ok: true as const, data: member };
      },
      { companyId },
    );
    if (!left.ok) return left;

    const member = left.data;
    await this.departure.complete({
      companyId,
      member: { id: member.id, email: member.email, status: member.status },
      loginId: session.user.id,
    });

    return { ok: true as const, data: { companyId } };
  }
}
