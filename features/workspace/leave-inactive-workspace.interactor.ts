import type { Data, Validated } from "@/core/validation/validation.utils";
import type { AuthService } from "@/features/auth/auth.service";
import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { LeaveWorkspaceRepo } from "./leave-workspace.repo";
import type { WorkspaceDepartureService } from "./workspace-departure.service";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { z } from "zod";
import { Status } from "@/generated/prisma";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import {
  fail,
  failAuthorization,
  failConflict,
  failNotFound,
  unwoundFailure,
} from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { workspaceLeaveRefusal } from "./member-removal-refusal";

const Schema = z.object({
  companyId: z.uuid(),
  status: z.enum([Status.inactive, Status.active]).optional(),
});
export type LeaveInactiveWorkspaceData = Data<typeof Schema>;

const OutputSchema = z.object({ companyId: z.string() });
type LeaveInactiveWorkspaceResult = Data<typeof OutputSchema>;

@SystemInteractor
export class LeaveInactiveWorkspaceInteractor {
  constructor(
    private readonly authService: AuthService,
    private readonly memberships: WorkspaceMembershipRepo,
    private readonly repo: LeaveWorkspaceRepo,
    private readonly roleRepo: UpdateUserRoleRepo,
    private readonly departure: WorkspaceDepartureService,
  ) {}

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke(data: LeaveInactiveWorkspaceData): Validated<LeaveInactiveWorkspaceResult> {
    const session = await this.authService.getInteractiveSession();
    if (!session) return failAuthorization(CustomErrorCode.permissionDenied);

    const { email } = session.user;
    const expected = data.status ?? Status.inactive;
    const membership = await this.memberships.findMembershipUnscoped(email, data.companyId);
    if (!membership) return failNotFound(CustomErrorCode.workspaceNotFound, ["companyId"]);
    if (membership.status !== expected) return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);

    const { companyId } = membership;

    return runWithTenant(membership, async () => {
      const refused = await runInTransaction(
        async () => {
          const member = await this.repo.findMemberCompanyWide({ id: membership.id });
          if (!member || member.leftAt || member.status !== expected)
            return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);

          const blocked = await workspaceLeaveRefusal(member, { members: this.repo, roles: this.roleRepo });
          if (blocked === "platformOperator") return failAuthorization(CustomErrorCode.workspaceMemberPlatformOperator);
          if (blocked === "lastAdmin") return fail(CustomErrorCode.workspaceLastAdmin);

          if (!(await this.repo.leaveCompanyWide(member.id)))
            return failConflict(CustomErrorCode.workspaceChanged, ["companyId"]);
          try {
            await this.departure.announce(member, "left");
          } catch (error) {
            return unwoundFailure(error);
          }
          return null;
        },
        { companyId },
      );
      if (refused) return refused;

      await this.departure.complete({
        companyId,
        member: { id: membership.id, email: membership.email, status: expected },
        loginId: session.user.id,
      });

      return { ok: true as const, data: { companyId } };
    });
  }
}
