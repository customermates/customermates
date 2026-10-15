import type { PrismaClient } from "@/generated/prisma";

export const SEED_IDS = {
  company: "10000000-0000-4000-8000-000000000001",
  hostedAiFixtureCompany: "10000000-0000-4000-8000-000000000002",
  secondWorkspaceCompany: "10000000-0000-4000-8000-000000000003",
  role: "20000000-0000-4000-8000-000000000001",
  salesManagerRole: "20000000-0000-4000-8000-000000000002",
  customerSuccessRole: "20000000-0000-4000-8000-000000000003",
  hostedAiFixtureRole: "20000000-0000-4000-8000-000000000004",
  secondWorkspaceRole: "20000000-0000-4000-8000-000000000008",
  user: "30000000-0000-4000-8000-000000000001",
  sofiaRossiUser: "30000000-0000-4000-8000-000000000002",
  elenaHoffmannUser: "30000000-0000-4000-8000-000000000003",
  hostedAiOrdinaryUser: "30000000-0000-4000-8000-000000000004",
  maxBergmannSecondWorkspaceUser: "30000000-0000-4000-8000-000000000009",
  maxBergmannCredentialAccount: "40000000-0000-4000-8000-000000000001",
  sofiaRossiCredentialAccount: "40000000-0000-4000-8000-000000000002",
  elenaHoffmannCredentialAccount: "40000000-0000-4000-8000-000000000003",
  hostedAiOrdinaryCredentialAccount: "40000000-0000-4000-8000-000000000004",
  subscription: "50000000-0000-4000-8000-000000000001",
  hostedAiFixtureSubscription: "50000000-0000-4000-8000-000000000002",
  secondWorkspaceSubscription: "50000000-0000-4000-8000-000000000003",
  hostedAiSettledUsage: "61000000-0000-4000-8000-000000000001",
  hostedAiReservedUsage: "61000000-0000-4000-8000-000000000002",
  hostedAiReleasedUsage: "61000000-0000-4000-8000-000000000003",
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
