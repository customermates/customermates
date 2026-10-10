import type { SeedContext } from "./context";
import { fixtureId } from "./helpers";
import { SYNTHETIC_SEED_TIMELINE } from "./timeline";

export const SYNTHETIC_ORGANIZATION_DEFINITIONS = [
  {
    emailDomain: "wavestone.example",
    name: "Wavestone",
    website: "https://www.wavestone.com",
  },
  {
    emailDomain: "sthree.example",
    name: "SThree",
    website: "https://www.sthree.com",
  },
  {
    emailDomain: "hays.example",
    name: "Hays",
    website: "https://www.hays.de",
  },
  {
    emailDomain: "arbeitsagentur.example",
    name: "Bundesagentur für Arbeit",
    website: "https://www.arbeitsagentur.de",
  },
  {
    emailDomain: "deloitte.example",
    name: "Deloitte",
    website: "https://www.deloitte.com",
  },
  {
    emailDomain: "asml.example",
    name: "ASML",
    website: "https://www.asml.com",
  },
  { emailDomain: "kpmg.example", name: "KPMG", website: "https://kpmg.com" },
  {
    emailDomain: "deutsche-post.example",
    name: "Deutsche Post",
    website: "https://www.deutschepost.de",
  },
  {
    emailDomain: "deutsche-bahn.example",
    name: "Deutsche Bahn",
    website: "https://www.bahn.de",
  },
  {
    emailDomain: "continental.example",
    name: "Continental",
    website: "https://www.continental.com",
  },
  { emailDomain: "pwc.example", name: "PwC", website: "https://www.pwc.com" },
  {
    emailDomain: "mckinsey.example",
    name: "McKinsey & Company",
    website: "https://www.mckinsey.com",
  },
  {
    emailDomain: "nrw-bank.example",
    name: "NRW.BANK",
    website: "https://www.nrwbank.de",
  },
  {
    emailDomain: "roche.example",
    name: "Roche",
    website: "https://www.roche.com",
  },
  { emailDomain: "bmw.example", name: "BMW", website: "https://www.bmw.com" },
  { emailDomain: "tui.example", name: "TUI", website: "https://www.tui.com" },
  {
    emailDomain: "volkswagen.example",
    name: "Volkswagen",
    website: "https://www.volkswagen.de",
  },
  {
    emailDomain: "telekom.example",
    name: "Deutsche Telekom",
    website: "https://www.telekom.com",
  },
  {
    emailDomain: "siemens.example",
    name: "Siemens",
    website: "https://www.siemens.com",
  },
] as const;

export const SYNTHETIC_ORGANIZATION_NAMES = SYNTHETIC_ORGANIZATION_DEFINITIONS.map(({ name }) => name);

export type OrganizationFixture = {
  companyId: string;
  createdAt: Date;
  emailDomain: (typeof SYNTHETIC_ORGANIZATION_DEFINITIONS)[number]["emailDomain"];
  id: string;
  name: (typeof SYNTHETIC_ORGANIZATION_DEFINITIONS)[number]["name"];
  updatedAt: Date;
  website: (typeof SYNTHETIC_ORGANIZATION_DEFINITIONS)[number]["website"];
};

export type OrganizationSeedData = {
  organizations: OrganizationFixture[];
};

export function seedOrganizations(context: SeedContext): Promise<OrganizationSeedData> {
  const organizations = SYNTHETIC_ORGANIZATION_DEFINITIONS.map(
    ({ emailDomain, name, website }, index) =>
      ({
        id: fixtureId("70000000", index + 1),
        companyId: context.ids.company,
        emailDomain,
        name,
        ...SYNTHETIC_SEED_TIMELINE.organization(index),
        website,
      }) satisfies OrganizationFixture,
  );

  return Promise.resolve({ organizations });
}
