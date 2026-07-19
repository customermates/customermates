import type { Prisma } from "@/generated/prisma";

import type { SeedContext } from "./context";
import { fixtureId, relationshipTarget, upsertFixturesById } from "./helpers";
import type { ServiceSeedData } from "./services";
import { SYNTHETIC_SEED_TIMELINE } from "./timeline";

export const SYNTHETIC_DEAL_NAMES = [
  "Process Automation Program",
  "Data & Analytics Transformation",
  "CRM Rollout & Sales Enablement",
  "Enterprise Integration Program",
  "Workplace Hardware Rollout",
  "Digital Customer Platform",
  "Data Center Refresh",
  "Cloud Infrastructure Migration",
  "Network Infrastructure Upgrade",
  "HR Systems Optimization",
] as const;

export const SYNTHETIC_DEAL_ORGANIZATION_LINKS = [
  [0, 7],
  [1, 10],
  [2, 13],
  [3, 5],
  [4, 7],
  [5, 14],
  [6, 9],
  [7, 9],
  [8, 0],
  [9, 2],
] as const;

export const SYNTHETIC_SERVICE_DEAL_LINKS = [
  [0, 25, 1],
  [0, 26, 4],
  [0, 28, 8],
  [0, 32, 30],
  [1, 5, 1],
  [1, 10, 1],
  [1, 12, 5],
  [1, 33, 1],
  [2, 0, 1],
  [2, 3, 4],
  [2, 14, 1],
  [2, 21, 6],
  [2, 22, 1],
  [3, 8, 10],
  [3, 15, 1],
  [3, 31, 1],
  [3, 37, 1],
  [4, 7, 300],
  [4, 30, 300],
  [4, 34, 150],
  [4, 39, 300],
  [5, 9, 70],
  [5, 13, 90],
  [5, 27, 1],
  [5, 38, 1],
  [6, 2, 12],
  [6, 11, 2],
  [6, 19, 24],
  [6, 40, 1],
  [6, 41, 12],
  [7, 4, 1],
  [7, 6, 1],
  [7, 18, 22],
  [7, 29, 4],
  [8, 1, 1],
  [8, 20, 1],
  [8, 24, 2],
  [8, 36, 6],
  [8, 42, 10],
  [9, 16, 25],
  [9, 17, 1],
  [9, 23, 1],
  [9, 35, 3],
] as const;

export const SYNTHETIC_DEAL_STATUS_INDEXES = [2, 0, 1, 1, 0, 0, 2, 1, 3, 1] as const;

export type DealDefinition = readonly [
  name: string,
  organizationIndex: number,
  contactIndexes: readonly number[],
  statusIndex: number,
];

export type DealFixture = Prisma.DealCreateManyInput & { id: string };

export type DealSeedData = {
  dealDefinitions: readonly DealDefinition[];
  deals: DealFixture[];
};

export async function seedDeals(context: SeedContext, serviceData: ServiceSeedData): Promise<DealSeedData> {
  const dealDefinitions: readonly DealDefinition[] = SYNTHETIC_DEAL_NAMES.map(
    (name, index) =>
      [
        name,
        relationshipTarget(SYNTHETIC_DEAL_ORGANIZATION_LINKS, index, "deal-organization"),
        [] as number[],
        SYNTHETIC_DEAL_STATUS_INDEXES[index],
      ] as const,
  );

  const deals = dealDefinitions.map(([name], index) => {
    const links = SYNTHETIC_SERVICE_DEAL_LINKS.filter(([dealIndex]) => dealIndex === index);
    const totalValue = links.reduce(
      (sum, [, serviceIndex, quantity]) => sum + serviceData.services[serviceIndex].amount * quantity,
      0,
    );
    const totalQuantity = links.reduce((sum, [, , quantity]) => sum + quantity, 0);

    return {
      id: fixtureId("80000000", index + 1),
      companyId: context.ids.company,
      name,
      totalQuantity,
      totalValue,
      ...SYNTHETIC_SEED_TIMELINE.deal(index),
    } satisfies Prisma.DealCreateManyInput;
  });

  await upsertFixturesById(deals, (deal) =>
    context.prisma.deal.upsert({
      where: { id: deal.id },
      update: deal,
      create: deal,
    }),
  );
  await context.prisma.deal.deleteMany({
    where: {
      companyId: context.ids.company,
      id: { startsWith: "80000000-", notIn: deals.map(({ id }) => id) },
    },
  });

  return { dealDefinitions, deals };
}
