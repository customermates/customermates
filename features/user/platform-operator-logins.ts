import type { AppPrismaClient } from "@/prisma/db";
import type { Prisma } from "@/generated/prisma";

import { Status } from "@/generated/prisma";
import { workspaceDeletionMarkerCutoff } from "@/features/workspace/workspace-deletion-marker";

const PLATFORM_OPERATOR_INVARIANT_LOCK = "customermates:platform-operator-invariant";

export async function lockPlatformOperatorInvariant(prisma: AppPrismaClient): Promise<void> {
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${PLATFORM_OPERATOR_INVARIANT_LOCK}, 0))`;
}

export async function platformOperatorEmails(
  prisma: AppPrismaClient,
  options: { canSignIn?: boolean } = {},
): Promise<string[]> {
  const logins = await prisma.authUser.findMany({
    where: { isPlatformOperator: true, ...(options.canSignIn ? { emailVerified: true } : {}) },
    select: { email: true },
  });

  return logins.map((login) => login.email);
}

export async function isPlatformOperatorEmail(prisma: AppPrismaClient, email: string): Promise<boolean> {
  const login = await prisma.authUser.findFirst({
    where: { email: { in: [email], mode: "insensitive" }, isPlatformOperator: true },
    select: { id: true },
  });

  return login !== null;
}

function activeMembership(emails: string[]): Prisma.UserWhereInput {
  return { email: { in: emails, mode: "insensitive" }, status: Status.active, leftAt: null };
}

function actingMembership(emails: string[]): Prisma.UserWhereInput {
  return {
    ...activeMembership(emails),
    company: { OR: [{ deletingAt: null }, { deletingAt: { lte: workspaceDeletionMarkerCutoff() } }] },
  };
}

export async function strandsLastPlatformOperator(
  prisma: AppPrismaClient,
  ending: Prisma.UserWhereInput,
): Promise<boolean> {
  await lockPlatformOperatorInvariant(prisma);
  const emails = await platformOperatorEmails(prisma, { canSignIn: true });
  if (emails.length === 0) return false;

  const endsOperatorMembership = await prisma.user.count({ where: { AND: [activeMembership(emails), ending] } });
  if (endsOperatorMembership === 0) return false;

  const remaining = await prisma.user.count({ where: { AND: [actingMembership(emails), { NOT: ending }] } });

  return remaining === 0;
}

export async function otherPlatformOperatorCanAct(prisma: AppPrismaClient, excludedEmail: string): Promise<boolean> {
  await lockPlatformOperatorInvariant(prisma);
  const excluded = excludedEmail.trim().toLowerCase();
  const emails = (await platformOperatorEmails(prisma, { canSignIn: true })).filter(
    (email) => email.trim().toLowerCase() !== excluded,
  );
  if (emails.length === 0) return false;

  return (await prisma.user.count({ where: actingMembership(emails) })) > 0;
}

export async function holdsPlatformOperatorsOnlyMembership(
  prisma: AppPrismaClient,
  companyId: string,
): Promise<boolean> {
  await lockPlatformOperatorInvariant(prisma);
  const emails = await platformOperatorEmails(prisma);
  if (emails.length === 0) return false;

  const operatorMembers = await prisma.user.findMany({
    where: { companyId, ...activeMembership(emails) },
    select: { email: true },
  });
  for (const member of operatorMembers) {
    const elsewhere = await prisma.user.count({
      where: { AND: [actingMembership([member.email]), { companyId: { not: companyId } }] },
    });
    if (elsewhere === 0) return true;
  }
  return false;
}
