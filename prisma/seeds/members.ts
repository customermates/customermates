import type { CountryCode, Prisma, Status } from "@/generated/prisma";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import type { SeedContext } from "./context";

import { SYNTHETIC_AVATAR_URLS } from "./avatars";
import { northwindAt, northwindMemberJoinedMs } from "./northwind-data";
import { NORTHWIND_MEMBER_IDS, NORTHWIND_MEMBER_ROLES } from "./northwind-model";

export type SyntheticCompanyMemberDefinition = Readonly<{
  agreeToTerms: boolean;
  avatarPath: string;
  country: CountryCode;
  email: string;
  firstName: string;
  id: string;
  isPlatformOperator: boolean;
  lastName: string;
  roleId: string | null;
  status: Status;
}>;

const member = (
  key: keyof typeof NORTHWIND_MEMBER_IDS,
  firstName: string,
  lastName: string,
  email: string,
  avatarPath: string,
  country: CountryCode,
) => ({
  id: NORTHWIND_MEMBER_IDS[key],
  agreeToTerms: false,
  avatarPath,
  country,
  email,
  firstName,
  isPlatformOperator: false,
  lastName,
  roleId: NORTHWIND_MEMBER_ROLES[key],
  status: "active" as Status,
});

/** The seven Northwind Labs members; the first three keep their historical ids and sign-in identities. */
export const SYNTHETIC_COMPANY_MEMBER_DEFINITIONS = [
  member(
    "maxBergmann",
    SYNTHETIC_COMPANY_USERS.maxBergmann.firstName,
    SYNTHETIC_COMPANY_USERS.maxBergmann.lastName,
    SYNTHETIC_COMPANY_USERS.maxBergmann.email,
    SYNTHETIC_AVATAR_URLS.maxBergmann,
    "de",
  ),
  member(
    "sofiaRossi",
    SYNTHETIC_COMPANY_USERS.sofiaRossi.firstName,
    SYNTHETIC_COMPANY_USERS.sofiaRossi.lastName,
    SYNTHETIC_COMPANY_USERS.sofiaRossi.email,
    SYNTHETIC_AVATAR_URLS.sofiaRossi,
    "it",
  ),
  member(
    "elenaHoffmann",
    SYNTHETIC_COMPANY_USERS.elenaHoffmann.firstName,
    SYNTHETIC_COMPANY_USERS.elenaHoffmann.lastName,
    SYNTHETIC_COMPANY_USERS.elenaHoffmann.email,
    SYNTHETIC_AVATAR_URLS.elenaHoffmann,
    "de",
  ),
  member(
    "claraNeumann",
    "Clara",
    "Neumann",
    "clara.neumann@customermates.com",
    SYNTHETIC_AVATAR_URLS.claraNeumann,
    "de",
  ),
  member("marcoSilva", "Marco", "Silva", "marco.silva@customermates.com", SYNTHETIC_AVATAR_URLS.marcoSilva, "pt"),
  member("kianRahimi", "Kian", "Rahimi", "kian.rahimi@customermates.com", SYNTHETIC_AVATAR_URLS.kianRahimi, "de"),
  member(
    "lauraFischer",
    "Laura",
    "Fischer",
    "laura.fischer@customermates.com",
    SYNTHETIC_AVATAR_URLS.lauraFischer,
    "de",
  ),
] satisfies readonly SyntheticCompanyMemberDefinition[];

async function reconcileMemberId(context: SeedContext, id: string, email: string): Promise<void> {
  const [existingById, existingByEmail] = await Promise.all([
    context.prisma.user.findUnique({ where: { id }, select: { id: true } }),
    context.prisma.user.findUnique({ where: { email }, select: { id: true } }),
  ]);

  if (!existingByEmail || existingByEmail.id === id) return;

  if (existingById) await context.prisma.user.delete({ where: { id: existingByEmail.id } });
  else {
    await context.prisma.user.update({
      where: { id: existingByEmail.id },
      data: { id },
    });
  }
}

export async function seedCompanyMembers(context: SeedContext): Promise<void> {
  const keys = Object.keys(NORTHWIND_MEMBER_IDS) as Array<keyof typeof NORTHWIND_MEMBER_IDS>;
  for (const [index, { avatarPath, ...definition }] of SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.entries()) {
    const joined = northwindAt(northwindMemberJoinedMs(keys[index]));
    const timeline = { createdAt: joined, updatedAt: new Date(joined.getTime() + 30 * 60_000) };
    const user = {
      ...definition,
      agentCreditActivatedAt: timeline.createdAt,
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
