import type { CountryCode, Prisma, Status } from "@/generated/prisma";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import type { SeedContext } from "./context";

import { SYNTHETIC_AVATAR_PATHS } from "./avatars";
import { SEED_IDS } from "./context";

export type SyntheticCompanyMemberDefinition = Readonly<{
  agreeToTerms: boolean;
  avatarPath: string;
  country: CountryCode;
  email: string;
  firstName: string;
  id: string;
  lastName: string;
  onboardingWizardCompletedAt: Date | null;
  roleId: string | null;
  status: Status;
}>;

export const SYNTHETIC_COMPANY_MEMBER_DEFINITIONS = [
  {
    id: SEED_IDS.user,
    agreeToTerms: true,
    avatarPath: SYNTHETIC_AVATAR_PATHS.maxBergmann,
    country: "de",
    email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
    firstName: SYNTHETIC_COMPANY_USERS.maxBergmann.firstName,
    lastName: SYNTHETIC_COMPANY_USERS.maxBergmann.lastName,
    onboardingWizardCompletedAt: new Date("2024-01-01T00:00:00.000Z"),
    roleId: SEED_IDS.role,
    status: "active",
  },
  {
    id: SEED_IDS.pendingUser,
    agreeToTerms: false,
    avatarPath: SYNTHETIC_AVATAR_PATHS.sofiaRossi,
    country: "it",
    email: SYNTHETIC_COMPANY_USERS.sofiaRossi.email,
    firstName: SYNTHETIC_COMPANY_USERS.sofiaRossi.firstName,
    lastName: SYNTHETIC_COMPANY_USERS.sofiaRossi.lastName,
    onboardingWizardCompletedAt: null,
    roleId: null,
    status: "pendingAuthorization",
  },
  {
    id: SEED_IDS.activeUser,
    agreeToTerms: true,
    avatarPath: SYNTHETIC_AVATAR_PATHS.elenaHoffmann,
    country: "de",
    email: SYNTHETIC_COMPANY_USERS.elenaHoffmann.email,
    firstName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.firstName,
    lastName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.lastName,
    onboardingWizardCompletedAt: new Date("2024-02-15T00:00:00.000Z"),
    roleId: SEED_IDS.customerSuccessRole,
    status: "active",
  },
] satisfies readonly SyntheticCompanyMemberDefinition[];

export async function seedCompanyMembers(context: SeedContext): Promise<void> {
  for (const { avatarPath, ...definition } of SYNTHETIC_COMPANY_MEMBER_DEFINITIONS) {
    const user = {
      ...definition,
      avatarUrl: avatarPath,
      companyId: context.ids.company,
    } satisfies Prisma.UserUncheckedCreateInput;

    await context.prisma.user.upsert({
      where: { id: user.id },
      update: user,
      create: user,
    });
  }
}
