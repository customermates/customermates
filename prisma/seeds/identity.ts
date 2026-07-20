import { hashPassword } from "better-auth/crypto";

import { SYNTHETIC_COMPANY_USERS } from "@/core/config/synthetic-seed-user";

import type { SeedContext } from "./context";

import { SYNTHETIC_AVATAR_PATHS } from "./avatars";
import { SEED_IDS } from "./context";
import { seedCompanyMembers } from "./members";
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

async function reconcileAuthUserId(context: SeedContext, id: string, email: string): Promise<void> {
  const [existingById, existingByEmail] = await Promise.all([
    context.prisma.authUser.findUnique({ where: { id }, select: { id: true } }),
    context.prisma.authUser.findUnique({ where: { email }, select: { id: true } }),
  ]);

  if (!existingByEmail || existingByEmail.id === id) return;

  if (existingById) await context.prisma.authUser.delete({ where: { id: existingByEmail.id } });
  else await context.prisma.authUser.update({ where: { id: existingByEmail.id }, data: { id } });
}

export async function seedIdentity(context: SeedContext): Promise<void> {
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

  for (const identity of SYNTHETIC_AUTH_IDENTITY_DEFINITIONS) {
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

  await seedCompanyMembers(context);

  for (const identity of SYNTHETIC_AUTH_IDENTITY_DEFINITIONS) {
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
