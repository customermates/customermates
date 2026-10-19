import type { AppPrismaClient } from "@/prisma/db";
import type { Prisma } from "@/generated/prisma";

import { Status } from "@/generated/prisma";

export async function platformOperatorEmails(prisma: AppPrismaClient): Promise<string[]> {
  const logins = await prisma.authUser.findMany({
    where: { isPlatformOperator: true },
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

export async function strandsLastPlatformOperator(
  prisma: AppPrismaClient,
  ending: Prisma.UserWhereInput,
): Promise<boolean> {
  const emails = await platformOperatorEmails(prisma);
  if (emails.length === 0) return false;

  const activeOperatorMembership: Prisma.UserWhereInput = {
    email: { in: emails, mode: "insensitive" },
    status: Status.active,
    leftAt: null,
  };
  const endsOperatorMembership = await prisma.user.count({ where: { AND: [activeOperatorMembership, ending] } });
  if (endsOperatorMembership === 0) return false;

  const remaining = await prisma.user.count({ where: { AND: [activeOperatorMembership, { NOT: ending }] } });

  return remaining === 0;
}
