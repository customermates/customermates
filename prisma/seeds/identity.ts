import { hashPassword } from "better-auth/crypto";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import type { SeedContext } from "./context";
import type { SyntheticCompanyMemberDefinition } from "./members";

import { SYNTHETIC_AVATAR_PATHS } from "./avatars";
import { SEED_IDS } from "./context";
import { SYNTHETIC_COMPANY_MEMBER_DEFINITIONS, seedCompanyMembers } from "./members";
import { seedRoles } from "./roles";
import { SYNTHETIC_SEED_TIMELINE } from "./timeline";

export const SYNTHETIC_SUBSCRIPTION = {
  plan: "pro",
  quantity: null,
  status: "active",
} as const;

export type SyntheticAuthIdentityDefinition = Readonly<{
  avatarPath: string;
  credentialAccountId: string;
  email: string;
  name: string;
  userId: string;
}>;

export const SYNTHETIC_AUTH_IDENTITY_DEFINITIONS = [
  {
    avatarPath: SYNTHETIC_AVATAR_PATHS.maxBergmann,
    credentialAccountId: SEED_IDS.maxBergmannCredentialAccount,
    email: SYNTHETIC_COMPANY_USERS.maxBergmann.email,
    name: SYNTHETIC_COMPANY_USERS.maxBergmann.name,
    userId: SEED_IDS.user,
  },
  {
    avatarPath: SYNTHETIC_AVATAR_PATHS.sofiaRossi,
    credentialAccountId: SEED_IDS.sofiaRossiCredentialAccount,
    email: SYNTHETIC_COMPANY_USERS.sofiaRossi.email,
    name: SYNTHETIC_COMPANY_USERS.sofiaRossi.name,
    userId: SEED_IDS.sofiaRossiUser,
  },
  {
    avatarPath: SYNTHETIC_AVATAR_PATHS.elenaHoffmann,
    credentialAccountId: SEED_IDS.elenaHoffmannCredentialAccount,
    email: SYNTHETIC_COMPANY_USERS.elenaHoffmann.email,
    name: SYNTHETIC_COMPANY_USERS.elenaHoffmann.name,
    userId: SEED_IDS.elenaHoffmannUser,
  },
] satisfies readonly SyntheticAuthIdentityDefinition[];

// A seed profile pairs the auth logins with their company-member records so the
// identity seed can run either the default synthetic team or a single-admin demo.
export type IdentitySeedProfile = Readonly<{
  authIdentities: readonly SyntheticAuthIdentityDefinition[];
  members: readonly SyntheticCompanyMemberDefinition[];
}>;

export const DEFAULT_IDENTITY_PROFILE: IdentitySeedProfile = {
  authIdentities: SYNTHETIC_AUTH_IDENTITY_DEFINITIONS,
  members: SYNTHETIC_COMPANY_MEMBER_DEFINITIONS,
};

async function reconcileAuthUserId(context: SeedContext, id: string, email: string): Promise<void> {
  const [existingById, existingByEmail] = await Promise.all([
    context.prisma.authUser.findUnique({ where: { id }, select: { id: true } }),
    context.prisma.authUser.findUnique({ where: { email }, select: { id: true } }),
  ]);

  if (!existingByEmail || existingByEmail.id === id) return;

  if (existingById) await context.prisma.authUser.delete({ where: { id: existingByEmail.id } });
  else await context.prisma.authUser.update({ where: { id: existingByEmail.id }, data: { id } });
}

export async function seedIdentity(
  context: SeedContext,
  profile: IdentitySeedProfile = DEFAULT_IDENTITY_PROFILE,
): Promise<void> {
  const { prisma, ids, sharedUserPassword } = context;

  const password = await hashPassword(sharedUserPassword);

  const company = {
    currency: "eur" as const,
    salesType: "service" as const,
    ...SYNTHETIC_SEED_TIMELINE.company,
  };
  await prisma.company.upsert({
    where: { id: ids.company },
    update: company,
    create: { id: ids.company, ...company },
  });

  await seedRoles(context);

  for (const identity of profile.authIdentities) {
    const authUser = {
      companyId: ids.company,
      email: identity.email,
      emailVerified: true,
      image: identity.avatarPath,
      name: identity.name,
    };

    await reconcileAuthUserId(context, identity.userId, identity.email);
    await prisma.authUser.upsert({
      where: { id: identity.userId },
      update: authUser,
      create: { id: identity.userId, ...authUser },
    });
  }

  await seedCompanyMembers(context, profile.members);

  for (const identity of profile.authIdentities) {
    await prisma.authAccount.deleteMany({
      where: {
        id: { not: identity.credentialAccountId },
        providerId: "credential",
        userId: identity.userId,
      },
    });
    const credentialAccount = {
      accountId: identity.userId,
      password,
      providerId: "credential",
      userId: identity.userId,
    };

    await prisma.authAccount.upsert({
      where: { id: identity.credentialAccountId },
      update: credentialAccount,
      create: { id: identity.credentialAccountId, ...credentialAccount },
    });
  }

  await prisma.subscription.upsert({
    where: { companyId: ids.company },
    update: SYNTHETIC_SUBSCRIPTION,
    create: {
      id: ids.subscription,
      companyId: ids.company,
      ...SYNTHETIC_SUBSCRIPTION,
    },
  });
}
