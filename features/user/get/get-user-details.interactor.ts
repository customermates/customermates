import { z } from "zod";
import { Resource, Action, CountryCode as CountryCodeEnum } from "@/generated/prisma";

import type { CountryCode } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";

const UserDetailsDtoSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  country: z.enum(CountryCodeEnum),
  avatarUrl: z.string().nullable(),
  roleId: z.string().nullable(),
  roleName: z.string().nullable(),
});

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
@TenantInteractor({
  permissions: [
    { resource: Resource.users, action: Action.readAll },
    { resource: Resource.users, action: Action.readOwn },
  ],
  condition: "OR",
})
export class GetUserDetailsInteractor extends AuthenticatedInteractor<void, UserDetails> {
  @ValidateOutput(UserDetailsDtoSchema)
  // The invoke method is not async, but the decorator requires it
  // eslint-disable-next-line @typescript-eslint/require-await
  async invoke(): Promise<{ ok: true; data: UserDetails }> {
    const { id, firstName, lastName, country, avatarUrl, roleId, role } = getTenantUser();

    return {
      ok: true as const,
      data: { id, firstName, lastName, country, avatarUrl, roleId, roleName: role?.name ?? null },
    };
  }
}
