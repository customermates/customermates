import type { TenantUser } from "@/features/user/user.schema";

import { isTenantGuardBypassed, getTenantUser } from "../decorators/tenant-context";

export class UserAccessor {
  public get user(): Readonly<TenantUser> {
    if (isTenantGuardBypassed()) throw new Error("User is not available when tenant is bypassed");

    return getTenantUser();
  }

  public get companyId(): string {
    return this.user.companyId;
  }

  public get userId(): string {
    return this.user.id;
  }
}
