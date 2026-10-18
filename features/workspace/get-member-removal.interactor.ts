import type { Data, Validated } from "@/core/validation/validation.utils";
import type { UpdateUserRoleRepo } from "@/features/user/upsert/update-user-role.repo";
import type { RemoveWorkspaceMemberRepo } from "./remove-workspace-member.repo";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { MEMBER_REMOVAL_REFUSALS, memberRemovalRefusal } from "./member-removal-refusal";

const Schema = z.object({ userId: z.uuid() });
export type GetMemberRemovalData = Data<typeof Schema>;

const OutputSchema = z.object({
  userId: z.uuid(),
  refusal: z.enum(MEMBER_REMOVAL_REFUSALS).nullable(),
});
export type MemberRemoval = Data<typeof OutputSchema>;

@TenantInteractor({ resource: Resource.users, manage: "update" })
export class GetMemberRemovalInteractor extends AuthenticatedInteractor<GetMemberRemovalData, MemberRemoval> {
  constructor(
    private readonly repo: RemoveWorkspaceMemberRepo,
    private readonly roleRepo: UpdateUserRoleRepo,
  ) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(OutputSchema)
  async invoke({ userId }: GetMemberRemovalData): Validated<MemberRemoval> {
    const member = await this.repo.findMemberCompanyWide({ id: userId });
    if (!member) return failNotFound(CustomErrorCode.userNotFound, ["userId"]);

    const refusal = await memberRemovalRefusal(member, this.userId, { members: this.repo, roles: this.roleRepo });

    return { ok: true as const, data: { userId: member.id, refusal } };
  }
}
