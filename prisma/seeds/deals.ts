import type { SeedContext } from "./context";
import { northwindAt, northwindDataset } from "./northwind-data";
import { northwindUpdatedAt } from "./northwind-history";
import type { ServiceSeedData } from "./services";

export const SYNTHETIC_DEAL_NAMES = northwindDataset().deals.map(({ name }) => name);

/** Organization of each deal, as [dealIndex, organizationIndex]. */
export const SYNTHETIC_DEAL_ORGANIZATION_LINKS = northwindDataset().deals.map(
  ({ index, organizationIndex }) => [index, organizationIndex] as const,
);

/** Line items as [dealIndex, serviceIndex, quantity]. */
export const SYNTHETIC_SERVICE_DEAL_LINKS = northwindDataset().lineItems.map(
  ({ dealIndex, serviceIndex, quantity }) => [dealIndex, serviceIndex, quantity] as const,
);

/** Index into the Status options (Open, Won, Lost, Abandoned) of each deal. */
export const SYNTHETIC_DEAL_STATUS_INDEXES = northwindDataset().deals.map(({ status }) =>
  ["open", "won", "lost", "abandoned"].indexOf(status),
);

/** Probability attribute of the Status options (Open, Won, Lost, Abandoned). */
export const SYNTHETIC_DEAL_STATUS_WEIGHTS = [30, 100, 0, 0] as const;

export type DealDefinition = readonly [
  name: string,
  organizationIndex: number,
  contactIndexes: readonly number[],
  statusIndex: number,
];

export type DealFixture = {
  id: string;
  companyId: string;
  name: string;
  totalQuantity: number;
  totalValue: number;
  weightedValue: number;
  createdAt: Date;
  updatedAt: Date;
};

export type DealSeedData = {
  dealDefinitions: readonly DealDefinition[];
  deals: DealFixture[];
};

const STAGE_PROBABILITY = { new: 10, qualified: 25, proposal: 60, won: 100, lost: 0 } as const;

export function seedDeals(context: SeedContext, _serviceData: ServiceSeedData): Promise<DealSeedData> {
  const { deals: dataset, lineItems } = northwindDataset();
  const dealDefinitions: readonly DealDefinition[] = dataset.map(
    (deal) =>
      [deal.name, deal.organizationIndex, deal.contactIndexes, SYNTHETIC_DEAL_STATUS_INDEXES[deal.index] ?? 0] as const,
  );
  const deals = dataset.map((deal) => {
    const totalQuantity = lineItems
      .filter((line) => line.dealIndex === deal.index)
      .reduce((sum, line) => sum + line.quantity, 0);
    return {
      id: deal.id,
      companyId: context.ids.company,
      name: deal.name,
      totalQuantity,
      totalValue: deal.totalValue,
      weightedValue: (deal.totalValue * STAGE_PROBABILITY[deal.stage]) / 100,
      createdAt: northwindAt(deal.createdAtMs),
      updatedAt: northwindUpdatedAt("deal", deal.id, deal.createdAtMs),
    } satisfies DealFixture;
  });

  return Promise.resolve({ dealDefinitions, deals });
}
