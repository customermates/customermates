import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { Status, CountryCode, Locale, Theme } from "@/generated/prisma";

import { RoleDtoSchema } from "@/features/role/role.schema";

export const UserDtoSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  roleId: z.uuid().nullable(),
  status: z.enum(Status),
  country: z.enum(CountryCode),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type UserDto = Data<typeof UserDtoSchema>;

export const UserByIdResponseSchema = z.object({
  user: UserDtoSchema.nullable(),
});

export const TenantUserSchema = UserDtoSchema.extend({
  companyId: z.string(),
  displayLanguage: z.enum(Locale),
  formattingLocale: z.enum(Locale),
  theme: z.enum(Theme),
  agreeToTerms: z.boolean(),
  lastActiveAt: z.date().nullable(),
  onboardingWizardCompletedAt: z.date().nullable(),
  role: RoleDtoSchema.nullable(),
});

export type TenantUser = Data<typeof TenantUserSchema>;
