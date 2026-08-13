import { z } from "zod";
import { Resource, Action, CountryCode as CountryCodeEnum, Status, Theme } from "@/generated/prisma";

import { TenantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { AllowInDemoMode } from "@/core/decorators/allow-in-demo-mode.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { AuthenticatedInteractor } from "@/core/base/authenticated-interactor";
import { getTenantUser } from "@/core/decorators/tenant-context";
import {
  StoredDisplayLanguageSchema,
  StoredFormattingLocaleSchema,
  normalizeStoredDisplayLanguage,
  normalizeStoredFormattingLocale,
} from "@/i18n/user-locale";

export const UserDetailsDtoSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  status: z.enum(Status),
  country: z.enum(CountryCodeEnum),
  avatarUrl: z.string().nullable(),
  theme: z.enum(Theme),
  displayLanguage: StoredDisplayLanguageSchema,
  formattingLocale: StoredFormattingLocaleSchema,
  roleId: z.string().nullable(),
  roleName: z.string().nullable(),
  roleIsSystemRole: z.boolean(),
});

export type UserDetails = z.infer<typeof UserDetailsDtoSchema>;

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
  // eslint-disable-next-line @typescript-eslint/require-await
  async invoke(): Promise<{ ok: true; data: UserDetails }> {
    const {
      id,
      firstName,
      lastName,
      email,
      status,
      country,
      avatarUrl,
      roleId,
      role,
      theme,
      displayLanguage,
      formattingLocale,
    } = getTenantUser();

    return {
      ok: true as const,
      data: {
        id,
        firstName,
        lastName,
        email,
        status,
        country,
        avatarUrl,
        theme,
        displayLanguage: normalizeStoredDisplayLanguage(displayLanguage),
        formattingLocale: normalizeStoredFormattingLocale(formattingLocale),
        roleId,
        roleName: role?.name ?? null,
        roleIsSystemRole: role?.isSystemRole ?? false,
      },
    };
  }
}
