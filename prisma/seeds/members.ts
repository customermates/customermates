import type { CountryCode, Prisma, Status } from "@/generated/prisma";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import type { SeedContext } from "./context";

import { SYNTHETIC_AVATAR_PATHS } from "./avatars";
import { SEED_IDS } from "./context";
import { SYNTHETIC_SEED_TIMELINE } from "./timeline";

export type SyntheticCompanyMemberDefinition = Readonly<{
  agreeToTerms: boolean;
  avatarPath: string;
  country: CountryCode;
  email: string;
  firstName: string;
  id: string;
  lastName: string;
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
    roleId: SEED_IDS.role,
    status: "active",
  },
  {
    id: SEED_IDS.sofiaRossiUser,
    agreeToTerms: true,
    avatarPath: SYNTHETIC_AVATAR_PATHS.sofiaRossi,
    country: "it",
    email: SYNTHETIC_COMPANY_USERS.sofiaRossi.email,
    firstName: SYNTHETIC_COMPANY_USERS.sofiaRossi.firstName,
    lastName: SYNTHETIC_COMPANY_USERS.sofiaRossi.lastName,
    roleId: SEED_IDS.salesManagerRole,
    status: "active",
  },
  {
    id: SEED_IDS.elenaHoffmannUser,
    agreeToTerms: true,
    avatarPath: SYNTHETIC_AVATAR_PATHS.elenaHoffmann,
    country: "de",
    email: SYNTHETIC_COMPANY_USERS.elenaHoffmann.email,
    firstName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.firstName,
    lastName: SYNTHETIC_COMPANY_USERS.elenaHoffmann.lastName,
    roleId: SEED_IDS.customerSuccessRole,
    status: "active",
  },
] satisfies readonly SyntheticCompanyMemberDefinition[];

async function reconcileMemberId(context: SeedContext, id: string, email: string): Promise<void> {
  const [existingById, existingByEmail] = await Promise.all([
    context.prisma.user.findUnique({ where: { id }, select: { id: true } }),
    context.prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);

  if (!existingByEmail || existingByEmail.id === id) return;

  if (existingById) await context.prisma.user.delete({ where: { id: existingByEmail.id } });
  else await context.prisma.user.update({ where: { id: existingByEmail.id }, data: { id } });
}

export async function seedCompanyMembers(
  context: SeedContext,
  members: readonly SyntheticCompanyMemberDefinition[] = SYNTHETIC_COMPANY_MEMBER_DEFINITIONS,
): Promise<void> {
  for (const [index, { avatarPath, ...definition }] of members.entries()) {
    const timeline = SYNTHETIC_SEED_TIMELINE.user(index);
    const user = {
      ...definition,
      avatarUrl: avatarPath,
      companyId: context.ids.company,
      onboardingWizardCompletedAt: new Date(timeline.updatedAt.getTime() + 5 * 60_000),
      ...timeline,
    } satisfies Prisma.UserUncheckedCreateInput;

    await reconcileMemberId(context, user.id, user.email);
    await context.prisma.user.upsert({
      where: { id: user.id },
      update: user,
      create: user,
    });
  }
}
