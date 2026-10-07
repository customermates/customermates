import type { Data, Validated } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource } from "@/generated/prisma";

import { type UserDto, UserByIdResponseSchema } from "../user.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import type { GetUserByIdRepo } from "./get-user-by-id.repo";

export const GetUserByIdSchema = z.object({
  id: z.uuid(),
});
export type GetUserByIdData = Data<typeof GetUserByIdSchema>;

@AllowInDemoMode
@TenantInteractor({ resource: Resource.users, read: true })
export class GetUserByIdInteractor extends AuthenticatedInteractor<GetUserByIdData, { user: UserDto | null }> {
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
