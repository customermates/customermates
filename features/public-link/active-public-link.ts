import type { Prisma } from "@/generated/prisma";

export function activePublicLinkWhere(now: Date = new Date()) {
  return {
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
  } satisfies Prisma.PublicViewLinkWhereInput;
}
