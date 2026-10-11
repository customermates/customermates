import type { SeedContext } from "./context";
import { fixtureId } from "./helpers";
import { NORTHWIND_SERVICES, NORTHWIND_STORY_END_MS, northwindAt } from "./northwind-data";

const DAY = 86_400_000;

/** The Northwind Labs price list: seats per year, onboarding packages and service days. */
export const SYNTHETIC_SERVICE_NAMES = NORTHWIND_SERVICES.map(([name]) => name);

export const SYNTHETIC_SERVICE_AMOUNTS = NORTHWIND_SERVICES.map(([, amount]) => amount);

export type ServiceDefinition = readonly [name: string, amount: number];

export type ServiceFixture = {
  amount: number;
  companyId: string;
  createdAt: Date;
  id: string;
  name: string;
  updatedAt: Date;
};

export type ServiceSeedData = {
  services: ServiceFixture[];
};

/** The catalog was set up when the workspace started and the prices were last reviewed in spring. */
export function seedServices(context: SeedContext): Promise<ServiceSeedData> {
  const services = NORTHWIND_SERVICES.map(
    ([name, amount], index) =>
      ({
        id: fixtureId("90000000", index + 1),
        amount,
        companyId: context.ids.company,
        name,
        createdAt: northwindAt(NORTHWIND_STORY_END_MS - (540 - index) * DAY),
        updatedAt: northwindAt(NORTHWIND_STORY_END_MS - (130 - index) * DAY),
      }) satisfies ServiceFixture,
  );

  return Promise.resolve({ services });
}
