import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Resource, Action } from "@/generated/prisma";

import { type UserDto, UserByIdResponseSchema } from "../user.schema";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { type Validated } from "@/core/validation/validation.utils";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";

const Schema = z.object({
  id: z.uuid(),
});
export type GetUserByIdData = Data<typeof Schema>;

export abstract class GetUserByIdRepo {
  abstract getUserById(id: string): Promise<UserDto | null>;
}

@AllowInDemoMode
@TenantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetUserByIdInteractor extends AuthenticatedInteractor<GetUserByIdData, { user: UserDto | null }> {
  constructor(private repo: GetUserByIdRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(UserByIdResponseSchema)
  async invoke(data: GetUserByIdData): Validated<{ user: UserDto | null }> {
    const user = await this.repo.getUserById(data.id);

    return { ok: true as const, data: { user } };
  }
}
