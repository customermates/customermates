import type { ExtendedUser } from "@/features/user/user.service";

import { isTenantGuardBypassed, getTenantUser } from "../decorators/tenant-context";

export class UserAccessor {
  public get user(): Readonly<ExtendedUser> {
    if (isTenantGuardBypassed()) throw new Error("User is not available when tenant is bypassed");

    return getTenantUser();
  }
}
