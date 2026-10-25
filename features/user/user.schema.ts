import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { CountryCode, Status, Locale, Theme } from "@/generated/prisma";

import { RoleDtoSchema } from "@/features/role/role.schema";

export const UserDtoSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  firstName: z.string(),
  lastName: z.string(),
  roleId: z.uuid().nullable(),
  status: z.enum(Status),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const MemberDtoSchema = UserDtoSchema.extend({
  leftAt: z.date().nullable(),
});

export type MemberDto = Data<typeof MemberDtoSchema>;

export const UserByIdResponseSchema = z.object({
  user: MemberDtoSchema.nullable(),
});

export const TenantUserSchema = UserDtoSchema.extend({
  companyId: z.string(),
  country: z.enum(CountryCode).optional(),
  displayLanguage: z.enum(Locale),
  formattingLocale: z.enum(Locale),
  theme: z.enum(Theme),
  agreeToTerms: z.boolean(),
  lastActiveAt: z.date().nullable(),
  onboardingWizardCompletedAt: z.date().nullable(),
  onboardingWikiStepCompletedAt: z.date().nullable(),
  role: RoleDtoSchema.nullable(),
  company: z.object({ slug: z.string() }).optional(),
});

export type TenantUser = Data<typeof TenantUserSchema>;
