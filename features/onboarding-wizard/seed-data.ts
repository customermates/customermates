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
export type SeedContact = {
  key: string;
  firstNameKey: string;
  lastNameKey: string;
  emailKey: string;
  orgKey: string;
};
export type SeedService = {
  key: string;
  nameKey: string;
  amount: number;
  productExtras?: { articleNumber: string; stockKey: "low" | "mid" | "high" };
  serviceExtras?: { billableHoursKey: "low" | "mid" | "high" };
};
export type SeedDeal = {
  key: string;
  nameKey: string;
  orgKey: string;
  contactKeys: string[];
  serviceLineItems: Array<{ serviceKey: string; quantity: number }>;
  stage: StageKey;
};
export type SeedTask = {
  key: string;
  nameKey: string;
  statusKey: "open" | "inProgress" | "done";
  contactKeys?: string[];
  orgKeys?: string[];
  dealKeys?: string[];
  serviceKeys?: string[];
};

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
  { key: "alex", firstNameKey: "alex.first", lastNameKey: "alex.last", emailKey: "alex.email", orgKey: "north-light" },
  {
    key: "priya",
    firstNameKey: "priya.first",
    lastNameKey: "priya.last",
    emailKey: "priya.email",
    orgKey: "north-light",
  },
  {
    key: "marius",
    firstNameKey: "marius.first",
    lastNameKey: "marius.last",
    emailKey: "marius.email",
    orgKey: "marlowe-and-cole",
  },
  {
    key: "elena",
    firstNameKey: "elena.first",
    lastNameKey: "elena.last",
    emailKey: "elena.email",
    orgKey: "harbor-and-line",
  },
  {
    key: "tomas",
    firstNameKey: "tomas.first",
    lastNameKey: "tomas.last",
    emailKey: "tomas.email",
    orgKey: "harbor-and-line",
  },
  {
    key: "linnea",
    firstNameKey: "linnea.first",
    lastNameKey: "linnea.last",
    emailKey: "linnea.email",
    orgKey: "kestrel-studios",
  },
  {
    key: "rashid",
    firstNameKey: "rashid.first",
    lastNameKey: "rashid.last",
    emailKey: "rashid.email",
    orgKey: "atlas-mobility",
  },
  {
    key: "sara",
    firstNameKey: "sara.first",
    lastNameKey: "sara.last",
    emailKey: "sara.email",
    orgKey: "atlas-mobility",
  },
];

const SHARED_TASKS: SeedTask[] = [
  {
    key: "intro-call",
    nameKey: "introCall",
    statusKey: "open",
    contactKeys: ["alex"],
    orgKeys: ["north-light"],
  },
  { key: "send-quote", nameKey: "sendQuote", statusKey: "inProgress", contactKeys: ["marius"] },
  {
    key: "kickoff-prep",
    nameKey: "kickoffPrep",
    statusKey: "open",
    contactKeys: ["elena", "tomas"],
    orgKeys: ["harbor-and-line"],
  },
  {
    key: "post-mortem",
    nameKey: "postMortem",
    statusKey: "done",
    contactKeys: ["linnea"],
    orgKeys: ["kestrel-studios"],
  },
  { key: "follow-up", nameKey: "followUp", statusKey: "open", contactKeys: ["rashid"] },
  {
    key: "contract-review",
    nameKey: "contractReview",
    statusKey: "inProgress",
    contactKeys: ["sara"],
    orgKeys: ["atlas-mobility"],
  },
  {
    key: "gather-requirements",
    nameKey: "gatherRequirements",
    statusKey: "open",
    contactKeys: ["priya"],
    orgKeys: ["north-light"],
  },
];

const PRODUCT_TASKS: SeedTask[] = [
  {
    key: "ship-starter-kits",
    nameKey: "shipStarterKits",
    statusKey: "open",
    dealKeys: ["north-light-starter"],
    serviceKeys: ["starter-kit"],
  },
  {
    key: "check-stock",
    nameKey: "checkStock",
    statusKey: "open",
    serviceKeys: ["premium-kit", "enterprise-kit"],
  },
  {
    key: "confirm-bulk-order",
    nameKey: "confirmBulkOrder",
    statusKey: "inProgress",
    dealKeys: ["marlowe-bulk", "kestrel-flagship"],
  },
];

const SERVICE_TASKS: SeedTask[] = [
  {
    key: "discovery-workshop",
    nameKey: "discoveryWorkshop",
    statusKey: "open",
    dealKeys: ["north-light-discovery"],
    serviceKeys: ["discovery"],
  },
  {
    key: "implementation-plan",
    nameKey: "implementationPlan",
    statusKey: "inProgress",
    dealKeys: ["marlowe-implementation"],
    serviceKeys: ["implementation"],
  },
  {
    key: "retainer-check-in",
    nameKey: "retainerCheckIn",
    statusKey: "open",
    dealKeys: ["kestrel-retainer"],
    serviceKeys: ["retainer"],
  },
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
    serviceExtras: { billableHoursKey: "low" },
  },
  {
    key: "implementation",
    nameKey: "implementation",
    amount: 6400,
    serviceExtras: { billableHoursKey: "mid" },
  },
  {
    key: "retainer",
    nameKey: "retainer",
    amount: 2400,
    serviceExtras: { billableHoursKey: "high" },
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
    tasks: salesType === SalesType.product ? [...SHARED_TASKS, ...PRODUCT_TASKS] : [...SHARED_TASKS, ...SERVICE_TASKS],
  };
}
