import type { Prisma, Status } from "@/generated/prisma";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import type { SeedContext } from "./context";
import type { SeedMembershipKey } from "./helpers";

import { SYNTHETIC_AVATAR_URLS } from "./avatars";
import { TEAM_MEMBER_IDS, TEAM_MEMBER_JOINED_DAYS_AGO, TEAM_MEMBER_ROLES } from "./team";
import { storyMoment } from "./timeline";

type SyntheticCompanyMemberDefinition = Readonly<{
  agreeToTerms: boolean;
  avatarPath: string;
  email: string;
  firstName: string;
  id: string;
  lastName: string;
  roleId: string | null;
  status: Status;
}>;

const member = (
  key: keyof typeof TEAM_MEMBER_IDS,
  firstName: string,
  lastName: string,
  email: string,
  avatarPath: string,
) => ({
  id: TEAM_MEMBER_IDS[key],
  agreeToTerms: false,
  avatarPath,
  email,
  firstName,
  lastName,
  roleId: TEAM_MEMBER_ROLES[key],
  status: "active" as Status,
});

/** The seven members of the small-business team; the first three keep their historical ids and sign-in identities. */
export const SYNTHETIC_COMPANY_MEMBER_DEFINITIONS = [
  member(
    "maxBergmann",
    SYNTHETIC_COMPANY_USERS.maxBergmann.firstName,
    SYNTHETIC_COMPANY_USERS.maxBergmann.lastName,
    SYNTHETIC_COMPANY_USERS.maxBergmann.email,
    SYNTHETIC_AVATAR_URLS.maxBergmann,
  ),
  member(
    "sofiaRossi",
    SYNTHETIC_COMPANY_USERS.sofiaRossi.firstName,
    SYNTHETIC_COMPANY_USERS.sofiaRossi.lastName,
    SYNTHETIC_COMPANY_USERS.sofiaRossi.email,
    SYNTHETIC_AVATAR_URLS.sofiaRossi,
  ),
  member(
    "elenaHoffmann",
    SYNTHETIC_COMPANY_USERS.elenaHoffmann.firstName,
    SYNTHETIC_COMPANY_USERS.elenaHoffmann.lastName,
    SYNTHETIC_COMPANY_USERS.elenaHoffmann.email,
    SYNTHETIC_AVATAR_URLS.elenaHoffmann,
  ),
  member("claraNeumann", "Clara", "Neumann", "clara.neumann@customermates.com", SYNTHETIC_AVATAR_URLS.claraNeumann),
  member("marcoSilva", "Marco", "Silva", "marco.silva@customermates.com", SYNTHETIC_AVATAR_URLS.marcoSilva),
  member("kianRahimi", "Kian", "Rahimi", "kian.rahimi@customermates.com", SYNTHETIC_AVATAR_URLS.kianRahimi),
  member("lauraFischer", "Laura", "Fischer", "laura.fischer@customermates.com", SYNTHETIC_AVATAR_URLS.lauraFischer),
] satisfies readonly SyntheticCompanyMemberDefinition[];

async function reconcileMemberId(
  context: SeedContext,
  id: string,
  { companyId, email }: SeedMembershipKey,
): Promise<void> {
  const [existingById, existingByEmail] = await Promise.all([
    context.prisma.user.findUnique({ where: { id }, select: { id: true } }),
    context.prisma.user.findUnique({ where: { companyId_email: { companyId, email } }, select: { id: true } }),
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
  const keys = Object.keys(TEAM_MEMBER_IDS) as Array<keyof typeof TEAM_MEMBER_IDS>;
  for (const [index, { avatarPath, ...definition }] of SYNTHETIC_COMPANY_MEMBER_DEFINITIONS.entries()) {
    const joined = storyMoment(TEAM_MEMBER_JOINED_DAYS_AGO[keys[index]]);
    const timeline = { createdAt: joined, updatedAt: new Date(joined.getTime() + 30 * 60_000) };
    const user = {
      ...definition,
      agentCreditActivatedAt: timeline.createdAt,
      avatarUrl: avatarPath,
      companyId: context.ids.company,
      onboardingWizardCompletedAt: new Date(timeline.updatedAt.getTime() + 5 * 60_000),
      ...timeline,
    } satisfies Prisma.UserUncheckedCreateInput;

    await reconcileMemberId(context, user.id, user);
    await context.prisma.user.upsert({
      where: { id: user.id },
      update: user,
      create: user,
    });
  }
}
