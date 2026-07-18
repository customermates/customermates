import type { PrismaClient } from "@/generated/prisma";

export const SEED_IDS = {
  company: "10000000-0000-4000-8000-000000000001",
  role: "20000000-0000-4000-8000-000000000001",
  salesManagerRole: "20000000-0000-4000-8000-000000000002",
  customerSuccessRole: "20000000-0000-4000-8000-000000000003",
  user: "30000000-0000-4000-8000-000000000001",
  sofiaRossiUser: "30000000-0000-4000-8000-000000000002",
  elenaHoffmannUser: "30000000-0000-4000-8000-000000000003",
  maxBergmannCredentialAccount: "40000000-0000-4000-8000-000000000001",
  sofiaRossiCredentialAccount: "40000000-0000-4000-8000-000000000002",
  elenaHoffmannCredentialAccount: "40000000-0000-4000-8000-000000000003",
  subscription: "50000000-0000-4000-8000-000000000001",
} as const;

export type SeedContext = {
  prisma: PrismaClient;
  ids: typeof SEED_IDS;
  seedUserEmail: string;
  sharedUserPassword: string;
};

export function createSeedContext(
  prisma: PrismaClient,
  input: Pick<SeedContext, "seedUserEmail" | "sharedUserPassword">,
): SeedContext {
  return { prisma, ids: SEED_IDS, ...input };
}
