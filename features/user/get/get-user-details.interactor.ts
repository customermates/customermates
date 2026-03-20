import { CountryCode, Resource, Action } from "@/generated/prisma";

import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { UserAccessor } from "@/core/base/user-accessor";

export interface UserDetails {
  id: string;
  firstName: string;
  lastName: string;
  country: CountryCode;
  avatarUrl: string | null;
  roleId: string | null;
  roleName: string | null;
}

@AllowInDemoMode
@TentantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetUserDetailsInteractor extends UserAccessor {
  // The invoke method is not async, but the decorator requires it
  // eslint-disable-next-line @typescript-eslint/require-await
  async invoke(): Promise<UserDetails> {
    const { id, firstName, lastName, country, avatarUrl, roleId, role } = this.user;

    return { id, firstName, lastName, country, avatarUrl, roleId, roleName: role?.name ?? null };
  }
}
