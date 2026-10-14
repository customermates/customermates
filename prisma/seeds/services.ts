import type { SeedContext } from "./context";
import { fixtureId } from "./helpers";
import { NORTHWIND_SERVICES, NORTHWIND_STORY_END_MS, northwindAt } from "./northwind-data";

const DAY = 86_400_000;

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
