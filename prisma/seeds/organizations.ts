import type { SeedContext } from "./context";
import { northwindAt, northwindDataset } from "./northwind-data";
import { northwindUpdatedAt } from "./northwind-history";

/** The 120 fictional Northwind Labs customers, prospects and former customers. */
export const SYNTHETIC_ORGANIZATION_DEFINITIONS = northwindDataset().organizations.map(({ domain, name, website }) => ({
  emailDomain: domain,
  name,
  website,
}));

export type OrganizationFixture = {
  companyId: string;
  createdAt: Date;
  emailDomain: string;
  id: string;
  name: string;
  updatedAt: Date;
  website: string;
};

export type OrganizationSeedData = {
  organizations: OrganizationFixture[];
};

export function seedOrganizations(context: SeedContext): Promise<OrganizationSeedData> {
  const organizations = northwindDataset().organizations.map(
    (organization) =>
      ({
        id: organization.id,
        companyId: context.ids.company,
        emailDomain: organization.domain,
        name: organization.name,
        createdAt: northwindAt(organization.createdAtMs),
        updatedAt: northwindUpdatedAt("organization", organization.id, organization.createdAtMs),
        website: organization.website,
      }) satisfies OrganizationFixture,
  );

  return Promise.resolve({ organizations });
}
