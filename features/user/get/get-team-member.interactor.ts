import type { Validated } from "@/core/validation/validation.utils";

import { Resource } from "@/generated/prisma";

import { type UserDto, UserByIdResponseSchema } from "../user.schema";
import { GetUserByIdSchema, type GetUserByIdData } from "./get-user-by-id.interactor";
import type { GetUserByIdRepo } from "./get-user-by-id.repo";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

@TenantInteractor({ resource: Resource.users, read: "all", manage: "update" })
export class GetTeamMemberInteractor extends AuthenticatedInteractor<GetUserByIdData, { user: UserDto | null }> {
  constructor(private repo: GetUserByIdRepo) {
    super();
  }

  @Validate(GetUserByIdSchema)
  @ValidateOutput(UserByIdResponseSchema)
  async invoke(data: GetUserByIdData): Validated<{ user: UserDto | null }> {
    const user = await this.repo.getUserById(data.id);

    return { ok: true as const, data: { user } };
  }
}
