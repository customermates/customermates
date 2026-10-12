import type { GetUserByIdRepo } from "../get/get-user-by-id.repo";
import type {
  AdminUpdateUserDetailsData,
  AdminUpdateUserDetailsInteractor,
} from "./admin-update-user-details.interactor";
import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { AdminUpdateUserDetailsSchema } from "./admin-update-user-details.interactor";

import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { fail, failNotFound } from "@/core/validation/interactor-failure-server";
import { CustomErrorCode } from "@/core/validation/validation.types";

export const UpdateTeamMemberSchema = z.object({
  userId: z.uuid(),
  roleId: AdminUpdateUserDetailsSchema.shape.roleId.optional(),
  status: AdminUpdateUserDetailsSchema.shape.status.optional(),
});
export type UpdateTeamMemberData = Data<typeof UpdateTeamMemberSchema>;

@TenantInteractor({ resource: Resource.users, read: "all", manage: "update" })
export class UpdateTeamMemberInteractor extends AuthenticatedInteractor<
  UpdateTeamMemberData,
  AdminUpdateUserDetailsData
> {
  constructor(
    private users: GetUserByIdRepo,
    private adminUpdate: AdminUpdateUserDetailsInteractor,
  ) {
    super();
  }

  @Validate(UpdateTeamMemberSchema)
  async invoke(data: UpdateTeamMemberData): Validated<AdminUpdateUserDetailsData> {
    const member = await this.users.getUserById(data.userId);
    if (!member) return failNotFound(CustomErrorCode.userNotFound, ["userId"]);
    const roleId = data.roleId ?? member.roleId;
    if (!roleId) return fail(CustomErrorCode.userRoleRequired, ["roleId"]);

    return this.adminUpdate.invoke({
      email: member.email,
      firstName: member.firstName,
      lastName: member.lastName,
      country: member.country,
      avatarUrl: member.avatarUrl,
      roleId,
      status: (data.status ?? member.status) as AdminUpdateUserDetailsData["status"],
    });
  }
}
