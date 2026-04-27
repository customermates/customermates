import { SalesType } from "@/generated/prisma";

export type StageKey = "new" | "qualified" | "quoted" | "won" | "lost";

export const PIPELINE_STAGES: ReadonlyArray<{ key: StageKey; color: string; index: number }> = [
  { key: "new", color: "secondary", index: 0 },
  { key: "qualified", color: "info", index: 1 },
  { key: "quoted", color: "warning", index: 2 },
  { key: "won", color: "success", index: 3 },
  { key: "lost", color: "destructive", index: 4 },
];

export type SeedOrganization = { key: string; nameKey: string };
export type SeedContact = { key: string; firstNameKey: string; lastNameKey: string; orgKey: string };
export type SeedService = {
  key: string;
  nameKey: string;
  amount: number;
  productExtras?: { articleNumber: string; stockKey: "low" | "mid" | "high" };
  serviceExtras?: { hourlyRate: number; billableHoursKey: "low" | "mid" | "high" };
};
export type SeedDeal = {
  key: string;
  nameKey: string;
  orgKey: string;
  contactKeys: string[];
  serviceLineItems: Array<{ serviceKey: string; quantity: number }>;
  stage: StageKey;
};
export type SeedTask = { key: string; nameKey: string; statusKey: "open" | "inProgress" | "done" };

export type SeedData = {
  organizations: SeedOrganization[];
  contacts: SeedContact[];
  services: SeedService[];
  deals: SeedDeal[];
  tasks: SeedTask[];
};

const SHARED_ORGS: SeedOrganization[] = [
  { key: "north-light", nameKey: "northLight" },
  { key: "marlowe-and-cole", nameKey: "marloweAndCole" },
  { key: "harbor-and-line", nameKey: "harborAndLine" },
  { key: "kestrel-studios", nameKey: "kestrelStudios" },
  { key: "atlas-mobility", nameKey: "atlasMobility" },
];

const SHARED_CONTACTS: SeedContact[] = [
  { key: "alex", firstNameKey: "alex.first", lastNameKey: "alex.last", orgKey: "north-light" },
  { key: "priya", firstNameKey: "priya.first", lastNameKey: "priya.last", orgKey: "north-light" },
  { key: "marius", firstNameKey: "marius.first", lastNameKey: "marius.last", orgKey: "marlowe-and-cole" },
  { key: "elena", firstNameKey: "elena.first", lastNameKey: "elena.last", orgKey: "harbor-and-line" },
  { key: "tomas", firstNameKey: "tomas.first", lastNameKey: "tomas.last", orgKey: "harbor-and-line" },
  { key: "linnea", firstNameKey: "linnea.first", lastNameKey: "linnea.last", orgKey: "kestrel-studios" },
  { key: "rashid", firstNameKey: "rashid.first", lastNameKey: "rashid.last", orgKey: "atlas-mobility" },
  { key: "sara", firstNameKey: "sara.first", lastNameKey: "sara.last", orgKey: "atlas-mobility" },
];

const SHARED_TASKS: SeedTask[] = [
  { key: "intro-call", nameKey: "introCall", statusKey: "open" },
  { key: "send-quote", nameKey: "sendQuote", statusKey: "inProgress" },
  { key: "kickoff-prep", nameKey: "kickoffPrep", statusKey: "open" },
  { key: "post-mortem", nameKey: "postMortem", statusKey: "done" },
];

const PRODUCT_SERVICES: SeedService[] = [
  {
    key: "starter-kit",
    nameKey: "starterKit",
    amount: 480,
    productExtras: { articleNumber: "SKU-1001", stockKey: "high" },
  },
  {
    key: "premium-kit",
    nameKey: "premiumKit",
    amount: 1280,
    productExtras: { articleNumber: "SKU-2002", stockKey: "mid" },
  },
  {
    key: "enterprise-kit",
    nameKey: "enterpriseKit",
    amount: 3600,
    productExtras: { articleNumber: "SKU-3003", stockKey: "low" },
  },
];

const SERVICE_SERVICES: SeedService[] = [
  {
    key: "discovery",
    nameKey: "discovery",
    amount: 1200,
    serviceExtras: { hourlyRate: 120, billableHoursKey: "low" },
  },
  {
    key: "implementation",
    nameKey: "implementation",
    amount: 6400,
    serviceExtras: { hourlyRate: 140, billableHoursKey: "mid" },
  },
  {
    key: "retainer",
    nameKey: "retainer",
    amount: 2400,
    serviceExtras: { hourlyRate: 130, billableHoursKey: "high" },
  },
];

const PRODUCT_DEALS: SeedDeal[] = [
  {
    key: "north-light-starter",
    nameKey: "northLightStarter",
    orgKey: "north-light",
    contactKeys: ["alex", "priya"],
    serviceLineItems: [{ serviceKey: "starter-kit", quantity: 50 }],
    stage: "new",
  },
  {
    key: "marlowe-bulk",
    nameKey: "marloweBulk",
    orgKey: "marlowe-and-cole",
    contactKeys: ["marius"],
    serviceLineItems: [{ serviceKey: "premium-kit", quantity: 20 }],
    stage: "qualified",
  },
  {
    key: "harbor-rollout",
    nameKey: "harborRollout",
    orgKey: "harbor-and-line",
    contactKeys: ["elena", "tomas"],
    serviceLineItems: [{ serviceKey: "premium-kit", quantity: 18 }],
    stage: "quoted",
  },
  {
    key: "kestrel-flagship",
    nameKey: "kestrelFlagship",
    orgKey: "kestrel-studios",
    contactKeys: ["linnea"],
    serviceLineItems: [
      { serviceKey: "enterprise-kit", quantity: 6 },
      { serviceKey: "starter-kit", quantity: 8 },
    ],
    stage: "won",
  },
  {
    key: "atlas-pilot",
    nameKey: "atlasPilot",
    orgKey: "atlas-mobility",
    contactKeys: ["rashid"],
    serviceLineItems: [{ serviceKey: "starter-kit", quantity: 50 }],
    stage: "lost",
  },
  {
    key: "atlas-expansion",
    nameKey: "atlasExpansion",
    orgKey: "atlas-mobility",
    contactKeys: ["sara"],
    serviceLineItems: [{ serviceKey: "premium-kit", quantity: 22 }],
    stage: "qualified",
  },
];

const SERVICE_DEALS: SeedDeal[] = [
  {
    key: "north-light-discovery",
    nameKey: "northLightDiscovery",
    orgKey: "north-light",
    contactKeys: ["alex", "priya"],
    serviceLineItems: [{ serviceKey: "discovery", quantity: 20 }],
    stage: "new",
  },
  {
    key: "marlowe-implementation",
    nameKey: "marloweImplementation",
    orgKey: "marlowe-and-cole",
    contactKeys: ["marius"],
    serviceLineItems: [{ serviceKey: "implementation", quantity: 4 }],
    stage: "qualified",
  },
  {
    key: "harbor-discovery",
    nameKey: "harborDiscovery",
    orgKey: "harbor-and-line",
    contactKeys: ["elena"],
    serviceLineItems: [
      { serviceKey: "discovery", quantity: 5 },
      { serviceKey: "implementation", quantity: 3 },
    ],
    stage: "quoted",
  },
  {
    key: "kestrel-retainer",
    nameKey: "kestrelRetainer",
    orgKey: "kestrel-studios",
    contactKeys: ["linnea"],
    serviceLineItems: [
      { serviceKey: "implementation", quantity: 1 },
      { serviceKey: "retainer", quantity: 9 },
    ],
    stage: "won",
  },
  {
    key: "atlas-discovery",
    nameKey: "atlasDiscovery",
    orgKey: "atlas-mobility",
    contactKeys: ["rashid"],
    serviceLineItems: [{ serviceKey: "discovery", quantity: 18 }],
    stage: "lost",
  },
  {
    key: "atlas-retainer",
    nameKey: "atlasRetainer",
    orgKey: "atlas-mobility",
    contactKeys: ["sara"],
    serviceLineItems: [{ serviceKey: "retainer", quantity: 12 }],
    stage: "qualified",
  },
];

export function getSeedData(salesType: SalesType): SeedData {
  return {
    organizations: SHARED_ORGS,
    contacts: SHARED_CONTACTS,
    services: salesType === SalesType.product ? PRODUCT_SERVICES : SERVICE_SERVICES,
    deals: salesType === SalesType.product ? PRODUCT_DEALS : SERVICE_DEALS,
    tasks: SHARED_TASKS,
  };
}
