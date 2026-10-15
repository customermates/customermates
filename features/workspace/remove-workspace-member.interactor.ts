import type { Data, Validated } from "@/core/validation/validation.utils";
import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { MemberRemovalRefusal } from "./member-removal-refusal";
import type { RemoveWorkspaceMemberRepo } from "./remove-workspace-member.repo";
import type { WorkspaceDepartureService } from "./workspace-departure.service";
import type { WorkspaceMembershipRepo } from "./workspace-membership.repo";

import { z } from "zod";
import { Resource, Status } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { runInTransaction } from "@/core/decorators/transaction-runner";
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
import { MEMBER_REMOVAL_REFUSAL_CODES, memberRemovalRefusal } from "./member-removal-refusal";

export const RemoveWorkspaceMemberSchema = z.object({
  userId: z.uuid().optional(),
  email: z.email().optional(),
});
export type RemoveWorkspaceMemberData = Data<typeof RemoveWorkspaceMemberSchema>;

export const RemovedWorkspaceMemberSchema = z.object({
  userId: z.uuid(),
  email: z.email(),
  previousStatus: z.enum(Status),
});
export type RemovedWorkspaceMember = Data<typeof RemovedWorkspaceMemberSchema>;

function refuse(refusal: MemberRemovalRefusal, path: string[]) {
  const code = MEMBER_REMOVAL_REFUSAL_CODES[refusal];
  return refusal === "self" || refusal === "platformOperator"
    ? failAuthorization(code, path)
    : failConflict(code, path);
}

@TenantInteractor({ resource: Resource.users, manage: "update" })
export class RemoveWorkspaceMemberInteractor extends AuthenticatedInteractor<
  RemoveWorkspaceMemberData,
  RemovedWorkspaceMember
> {
  constructor(
    private readonly repo: RemoveWorkspaceMemberRepo,
    private readonly roleRepo: UpdateUserRoleRepo,
    private readonly memberships: WorkspaceMembershipRepo,
    private readonly departure: WorkspaceDepartureService,
  ) {
    super();
  }

  @Validate(RemoveWorkspaceMemberSchema)
  @ValidateOutput(RemovedWorkspaceMemberSchema)
  async invoke({ userId, email }: RemoveWorkspaceMemberData): Validated<RemovedWorkspaceMember> {
    if (!userId && !email) return fail(CustomErrorCode.memberReferenceRequired, ["userId"]);
    const path = [userId ? "userId" : "email"];
    const { companyId } = this;

    const removal = await runInTransaction(
      async () => {
        const member = await this.repo.findMemberCompanyWide(userId ? { id: userId } : { email: email ?? "" });
        if (!member || (userId && email && member.email !== email))
          return failNotFound(CustomErrorCode.userNotFound, path);

        const refusal = await memberRemovalRefusal(member, this.userId, { members: this.repo, roles: this.roleRepo });
        if (refusal) return refuse(refusal, path);

        await this.repo.leaveCompanyWide(member.id);
        try {
          await this.departure.announce(member);
        } catch (error) {
          return unwoundFailure(error);
        }
        return { ok: true as const, data: member };
      },
      { companyId },
    );
    if (!removal.ok) return removal;

    const member = removal.data;
    await this.departure.complete({
      companyId,
      member: { id: member.id, email: member.email, status: member.status },
      loginId: await this.memberships.findLoginIdUnscoped(member.email),
    });

    return { ok: true as const, data: { userId: member.id, email: member.email, previousStatus: member.status } };
  }
}
