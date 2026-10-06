import type { Validated } from "@/core/validation/validation.utils";

import { Resource, Action } from "@/generated/prisma";

import { type UserDto, UserByIdResponseSchema } from "../user.schema";
import { GetUserByIdSchema, type GetUserByIdData, type GetUserByIdRepo } from "./get-user-by-id.interactor";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

@TenantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.update },
    { resource: Resource.users, action: Action.readAll },
  ],
})
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
