import { SYNTHETIC_CONTACT_AVATAR_URLS } from "./avatars";
import { fixtureId } from "./helpers";
import type { NORTHWIND_MEMBER_IDS, NORTHWIND_OPTION_KEYS } from "./northwind-model";
import { NORTHWIND_RECORD_ID_PREFIXES } from "./northwind-model";
import { SYNTHETIC_AUTHORED_END_MS, SYNTHETIC_TIMELINE_SHIFT_MS } from "./timeline";

/**
 * Deterministic generator of the Northwind Labs demo records. Everything derives from one seeded random stream
 * and is authored against the fixed story end (`SYNTHETIC_AUTHORED_END_MS`); the timeline shift then moves the
 * whole story so its newest day lands in the current week. Prices, stages, priorities, tiers and naming follow
 * the workspace Knowledge Base (prisma/seeds/wiki.ts). The output is pure data; the seed modules write it.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
export const NORTHWIND_HISTORY_DAYS = 548;
const END = SYNTHETIC_AUTHORED_END_MS;
const START = END - NORTHWIND_HISTORY_DAYS * DAY;

type Option<F extends keyof typeof NORTHWIND_OPTION_KEYS> = (typeof NORTHWIND_OPTION_KEYS)[F][number];
export type Industry = Option<"organization.industry">;
export type Segment = Option<"organization.segment">;
export type DealStage = Option<"deal.stage">;
export type DealType = Option<"deal.dealType">;
export type LeadSource = Option<"deal.leadSource">;
export type LostReason = Option<"deal.lostReason">;
export type DealStatus = "open" | "won" | "lost" | "abandoned";
export type MemberKey = keyof typeof NORTHWIND_MEMBER_IDS;

/** Shifted instant of an authored time. */
export function northwindAt(authoredMs: number): Date {
  return new Date(authoredMs + SYNTHETIC_TIMELINE_SHIFT_MS);
}

/** Shifted calendar day (YYYY-MM-DD) of an authored time. */
export function northwindDay(authoredMs: number): string {
  return northwindAt(authoredMs).toISOString().slice(0, 10);
}

/** The authored story end (the newest moment of the demo). */
export const NORTHWIND_STORY_END_MS = END;

function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(values: readonly T[]): T => values[Math.floor(next() * values.length)];
  const chance = (probability: number) => next() < probability;
  const weighted = <T>(entries: ReadonlyArray<readonly [T, number]>): T => {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let roll = next() * total;
    for (const [value, weight] of entries) {
      roll -= weight;
      if (roll < 0) return value;
    }
    return entries[entries.length - 1][0];
  };
  return { next, int, pick, chance, weighted };
}
type Random = ReturnType<typeof random>;

/** A working-hours instant on the given authored day (weekends move to Monday). */
function workTime(rng: Random, dayStart: number): number {
  const day = Math.floor(dayStart / DAY) * DAY;
  const weekday = new Date(day).getUTCDay();
  const shift = weekday === 6 ? 2 : weekday === 0 ? 1 : 0;
  return day + shift * DAY + (7 + rng.int(0, 9)) * HOUR + rng.int(0, 11) * 5 * 60_000;
}

// ---------------------------------------------------------------------------------------------------------------
// Catalog

export type NorthwindServiceKind = "license" | "onboarding" | "integration" | "training";
/** The price list of the pricing page: seats per year, onboarding packages and service days. */
export const NORTHWIND_SERVICES = [
  ["Northwind Field Starter seat (annual)", 348, "license", "subscription"],
  ["Northwind Field Professional seat (annual)", 588, "license", "subscription"],
  ["Northwind Field Enterprise seat (annual)", 948, "license", "subscription"],
  ["Onboarding Quick Start", 2_900, "onboarding", "oneTime"],
  ["Onboarding Standard", 8_500, "onboarding", "oneTime"],
  ["Onboarding Enterprise", 19_000, "onboarding", "oneTime"],
  ["Integration work (day)", 1_250, "integration", "perDay"],
  ["On-site training (day)", 1_600, "training", "perDay"],
] as const satisfies ReadonlyArray<
  readonly [string, number, NorthwindServiceKind, "subscription" | "oneTime" | "perDay"]
>;
const SERVICE = {
  starter: 0,
  professional: 1,
  enterprise: 2,
  onboardingQuickStart: 3,
  onboardingStandard: 4,
  onboardingEnterprise: 5,
  integrationDay: 6,
  trainingDay: 7,
} as const;

export type Plan = "starter" | "professional" | "enterprise";
/** Price per seat and month, billed annually. */
export const NORTHWIND_SEAT_PRICES: Record<Plan, number> = { starter: 29, professional: 49, enterprise: 79 };
const MINIMUM_SEATS: Record<Plan, number> = { starter: 10, professional: 25, enterprise: 75 };
const PLAN_LABEL: Record<Plan, string> = { starter: "Starter", professional: "Professional", enterprise: "Enterprise" };
const SEAT_SERVICE: Record<Plan, number> = {
  starter: SERVICE.starter,
  professional: SERVICE.professional,
  enterprise: SERVICE.enterprise,
};
const ONBOARDING_SERVICE: Record<Plan, number> = {
  starter: SERVICE.onboardingQuickStart,
  professional: SERVICE.onboardingStandard,
  enterprise: SERVICE.onboardingEnterprise,
};
const TYPE_LABEL: Record<DealType, string> = { new: "New", expansion: "Expansion", renewal: "Renewal" };

// ---------------------------------------------------------------------------------------------------------------
// Organizations

const ORGANIZATION_STEMS = [
  "Hansen",
  "Brightwater",
  "Kessler",
  "Nordlicht",
  "Altmark",
  "Rheinfeld",
  "Vossberg",
  "Elbtal",
  "Harborline",
  "Ironvale",
  "Lindqvist",
  "Mertz",
  "Oakridge",
  "Pfeiffer",
  "Quellwerk",
  "Riverton",
  "Sonnenhof",
  "Talbrook",
  "Uhlmann",
  "Westhaven",
  "Ziegler",
  "Brandt",
  "Corvus",
  "Dunmore",
  "Falkenrath",
  "Greystone",
  "Hollis",
  "Isarwerk",
  "Jansen",
  "Kranich",
  "Lowell",
  "Moorfield",
  "Neumark",
  "Ostwind",
  "Parkside",
  "Redcliff",
  "Steinbach",
  "Thornbury",
  "Unterberg",
  "Valemont",
  "Wendland",
  "Ashgrove",
  "Birkenfeld",
  "Calder",
  "Drachenfels",
  "Eastmere",
  "Fennick",
  "Glenhaven",
  "Haldern",
  "Ivers",
  "Juniper",
  "Kaltenbach",
  "Larkspur",
  "Mainbrück",
  "Northgate",
  "Oderland",
  "Pemberton",
  "Rosenau",
  "Saalbach",
  "Tannberg",
] as const;

const INDUSTRY_SUFFIXES: Record<Industry, readonly string[]> = {
  facilityManagement: ["Facility Services", "Building Services", "Property Care"],
  hvac: ["Climate Systems", "HVAC Service", "Heating and Cooling"],
  elevators: ["Lift Systems", "Elevator Service"],
  utilities: ["Municipal Utilities", "Energy Networks", "Water and Power"],
  logistics: ["Logistics", "Freight Services"],
  medicalDevices: ["Medical Systems", "Medtech Service"],
  solar: ["Solar", "Solar Installations"],
  propertyManagement: ["Property Management", "Estates"],
  securitySystems: ["Security Systems", "Fire and Safety"],
  waterTreatment: ["Water Technologies", "Pump Service"],
};

const INDUSTRY_WEIGHTS: ReadonlyArray<readonly [Industry, number]> = [
  ["facilityManagement", 18],
  ["hvac", 16],
  ["elevators", 10],
  ["utilities", 10],
  ["logistics", 8],
  ["medicalDevices", 8],
  ["solar", 12],
  ["propertyManagement", 10],
  ["securitySystems", 8],
  ["waterTreatment", 6],
];

const LEAD_SOURCE_WEIGHTS: ReadonlyArray<readonly [LeadSource, number]> = [
  ["websiteDemo", 26],
  ["contentDownload", 12],
  ["webinar", 8],
  ["tradeFair", 8],
  ["paidSearch", 10],
  ["linkedin", 10],
  ["outbound", 16],
  ["customerReferral", 10],
];

export type NorthwindProfile = "legacyCustomer" | "newCustomer" | "formerCustomer" | "prospect";

export type NorthwindOrganization = {
  index: number;
  id: string;
  name: string;
  shortName: string;
  domain: string;
  website: string;
  industry: Industry;
  segment: Segment;
  companySize: number;
  profile: NorthwindProfile;
  leadSource: LeadSource;
  customerSince: number | null;
  createdAtMs: number;
  notes: string | null;
};

// ---------------------------------------------------------------------------------------------------------------
// People

/** Contacts with an approved avatar photo, in avatar order. Messaging fixtures refer to them by index. */
export const NORTHWIND_NAMED_CONTACTS = [
  ["Leon", "Becker"],
  ["Tim", "Wagner"],
  ["Lucio", "Ball"],
  ["Mara", "Bauer"],
  ["Max", "Schmidt"],
  ["Sophie", "Hoffmann"],
  ["Jonas", "Weber"],
  ["Amin", "Hassan"],
  ["Lea", "Bauer"],
  ["Maxine", "Zoll"],
  ["Lina", "Alvarez"],
  ["Felix", "Koch"],
  ["Omar", "Khalil"],
  ["Tim", "Weber"],
  ["Leila", "Chen"],
  ["Mia", "Schneider"],
  ["Amir", "Haddad"],
  ["Sophie", "Wagner"],
  ["Reinhold", "Mertens"],
  ["Alexej", "Sofr"],
  ["Anna", "Müller"],
  ["Yasmin", "Farouk"],
  ["Lukas", "Fischer"],
  ["Felix", "Schneider"],
  ["Rashid", "Malik"],
  ["Paul", "Koch"],
  ["Nia", "Johnson"],
  ["Paul", "Fischer"],
] as const;

const FIRST_NAMES = [
  "Adrian",
  "Alina",
  "Ben",
  "Carla",
  "Daniel",
  "Elif",
  "Emil",
  "Eva",
  "Fabian",
  "Frieda",
  "Georg",
  "Greta",
  "Hannah",
  "Henrik",
  "Ida",
  "Ilias",
  "Jana",
  "Jan",
  "Julia",
  "Karim",
  "Katrin",
  "Lars",
  "Lena",
  "Linus",
  "Luisa",
  "Malte",
  "Marie",
  "Mats",
  "Mila",
  "Moritz",
  "Nadine",
  "Nils",
  "Noah",
  "Olivia",
  "Oskar",
  "Pia",
  "Philipp",
  "Rania",
  "Ruben",
  "Sandra",
  "Sebastian",
  "Selin",
  "Simon",
  "Svenja",
  "Theo",
  "Tobias",
  "Ulrike",
  "Valentin",
  "Vera",
  "Wiebke",
  "Yusuf",
  "Zoe",
  "Aylin",
  "Bastian",
  "Charlotte",
  "David",
  "Esther",
  "Finn",
  "Hugo",
  "Isabel",
] as const;
const LAST_NAMES = [
  "Albrecht",
  "Arslan",
  "Baumann",
  "Berger",
  "Dietrich",
  "Engel",
  "Franke",
  "Graf",
  "Hartmann",
  "Herrmann",
  "Jung",
  "Kaiser",
  "Keller",
  "Klein",
  "Krause",
  "Kuhn",
  "Lange",
  "Lehmann",
  "Lorenz",
  "Ludwig",
  "Maier",
  "Meyer",
  "Möller",
  "Nowak",
  "Otto",
  "Peters",
  "Pohl",
  "Richter",
  "Roth",
  "Sander",
  "Schäfer",
  "Schulz",
  "Schwarz",
  "Seidel",
  "Simon",
  "Sommer",
  "Stein",
  "Thomsen",
  "Vogel",
  "Voigt",
  "Walter",
  "Werner",
  "Winkler",
  "Wolf",
  "Yilmaz",
  "Zimmermann",
  "de Vries",
  "Jensen",
  "Novak",
  "O'Brien",
  "Costa",
  "Petrov",
  "Lund",
  "Moreau",
  "Santos",
  "Kowalski",
  "Brennan",
  "Lindgren",
  "Haas",
  "Brooks",
] as const;

const JOB_TITLES: ReadonlyArray<readonly [string, Option<"contact.dealRole">, number]> = [
  ["Managing Director", "decisionMaker", 1],
  ["Chief Operating Officer", "decisionMaker", 1],
  ["Head of Service Operations", "champion", 3],
  ["Service Operations Manager", "champion", 3],
  ["Dispatcher Lead", "user", 3],
  ["IT Manager", "influencer", 2],
  ["Procurement Manager", "procurement", 2],
  ["Technician Team Lead", "user", 2],
  ["Head of Customer Service", "influencer", 2],
  ["CFO", "decisionMaker", 1],
];

export type NorthwindContact = {
  index: number;
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  email: string;
  phone: string;
  linkedin: string | null;
  jobTitle: string;
  dealRoles: Option<"contact.dealRole">[];
  organizationIndex: number;
  leadSource: LeadSource;
  lifecycle: "new" | "contact" | "qualified" | "inProgress" | "won" | "lost";
  createdAtMs: number;
};

// ---------------------------------------------------------------------------------------------------------------
// Deals and line items

export type NorthwindLineItem = {
  index: number;
  id: string;
  dealIndex: number;
  serviceIndex: number;
  quantity: number;
  /** Saved (negotiated) unit price when the line is frozen below the catalog price. */
  savedPrice: number | null;
};

export type NorthwindDeal = {
  index: number;
  id: string;
  name: string;
  type: DealType;
  organizationIndex: number;
  contactIndexes: number[];
  ownerKey: MemberKey;
  createdAtMs: number;
  closeAtMs: number;
  status: DealStatus;
  stage: DealStage;
  /** Stage before the deal was closed, for the stage-change history. */
  previousStage: DealStage | null;
  lostReason: LostReason | null;
  leadSource: LeadSource;
  plan: Plan;
  seats: number;
  discountPercent: number;
  totalValue: number;
  listValue: number;
  campaignIndex: number | null;
  partnerIndex: number | null;
  subscriptionIndex: number | null;
  notes: string | null;
};

// ---------------------------------------------------------------------------------------------------------------
// Custom lists

export type NorthwindSubscription = {
  index: number;
  id: string;
  name: string;
  organizationIndex: number;
  dealIndex: number | null;
  plan: Plan;
  billing: "perSeat" | "annualPrice";
  seats: number;
  pricePerSeat: number;
  annualPrice: number | null;
  arr: number;
  startMs: number;
  renewalMs: number;
  health: Option<"subscription.health">;
  previousHealth: Option<"subscription.health"> | null;
  createdAtMs: number;
};

export type NorthwindOnboarding = {
  index: number;
  id: string;
  name: string;
  dealIndex: number;
  organizationIndex: number;
  subscriptionIndex: number | null;
  ownerKey: MemberKey;
  phase: Option<"onboarding.phase">;
  progress: number;
  startMs: number;
  endMs: number;
  createdAtMs: number;
};

export type NorthwindTicket = {
  index: number;
  id: string;
  name: string;
  subscriptionIndex: number;
  contactIndex: number;
  priority: Option<"ticket.priority">;
  status: Option<"ticket.status">;
  categories: Option<"ticket.category">[];
  assigneeKey: MemberKey;
  openedMs: number;
  slaDueMs: number;
  lastResponseMs: number;
  resolvedMs: number | null;
};

export type NorthwindCampaign = {
  index: number;
  id: string;
  name: string;
  channel: Option<"campaign.channel">;
  ownerKey: MemberKey;
  budget: number;
  actualSpend: number;
  startMs: number;
  endMs: number;
  notes: string;
};

export type NorthwindPartner = {
  index: number;
  id: string;
  name: string;
  tier: Option<"partner.tier">;
  region: Option<"partner.region">;
  website: string;
  commissionRate: number;
  annualFee: number;
  createdAtMs: number;
};

export type NorthwindOpenRole = {
  index: number;
  id: string;
  name: string;
  department: Option<"openRole.department">;
  status: Option<"openRole.status">;
  hiringManagerKey: MemberKey;
  salaryBudget: number;
  targetStartMs: number;
  createdAtMs: number;
};

export type NorthwindCandidate = {
  index: number;
  id: string;
  name: string;
  openRoleIndex: number;
  stage: Option<"candidate.stage">;
  source: Option<"candidate.source">;
  email: string;
  appliedMs: number;
  salaryExpectation: number;
  interviewerKey: MemberKey | null;
  interviewNotes: string[] | null;
};

export type NorthwindTask = {
  index: number;
  id: string;
  name: string;
  team: Option<"task.team">;
  status: "open" | "inProgress" | "blocked" | "onHold" | "done" | "archived";
  priority: "low" | "medium" | "high";
  assigneeKey: MemberKey | null;
  dueMs: number;
  createdAtMs: number;
  contactIndexes: number[];
  organizationIndexes: number[];
  dealIndexes: number[];
  serviceIndexes: number[];
};

export type NorthwindDataset = {
  organizations: NorthwindOrganization[];
  contacts: NorthwindContact[];
  services: typeof NORTHWIND_SERVICES;
  deals: NorthwindDeal[];
  lineItems: NorthwindLineItem[];
  subscriptions: NorthwindSubscription[];
  onboardings: NorthwindOnboarding[];
  tickets: NorthwindTicket[];
  campaigns: NorthwindCampaign[];
  partners: NorthwindPartner[];
  openRoles: NorthwindOpenRole[];
  candidates: NorthwindCandidate[];
  tasks: NorthwindTask[];
};

const MEMBER_JOINED: Record<MemberKey, number> = {
  maxBergmann: START - 30 * DAY,
  sofiaRossi: START - 29 * DAY,
  elenaHoffmann: START - 28 * DAY,
  lauraFischer: START + 14 * DAY,
  claraNeumann: START + 42 * DAY,
  kianRahimi: START + 63 * DAY,
  marcoSilva: START + 91 * DAY,
};

/** Authored join time of each member. */
export function northwindMemberJoinedMs(key: MemberKey): number {
  return MEMBER_JOINED[key];
}

const CAMPAIGNS = [
  [
    "Trade fair",
    "Field Service Summit Berlin",
    "tradeFair",
    "maxBergmann",
    38_000,
    -470,
    -467,
    "Booth with a live route planning demo; 140 badge scans.",
  ],
  [
    "Webinar",
    "Route planning for HVAC",
    "webinar",
    "sofiaRossi",
    4_500,
    -400,
    -380,
    "Run with a regional HVAC association; 260 sign-ups.",
  ],
  [
    "LinkedIn Ads",
    "Facility managers DACH",
    "linkedinAds",
    "sofiaRossi",
    22_000,
    -330,
    -240,
    "Lead forms aimed at facility and service managers.",
  ],
  [
    "Paid search",
    "Technician scheduling software",
    "googleAds",
    "maxBergmann",
    18_000,
    -300,
    -30,
    "Always-on search campaign on scheduling and dispatch terms.",
  ],
  [
    "Email",
    "Solar installer nurture",
    "email",
    "sofiaRossi",
    3_000,
    -220,
    -160,
    "Six-step nurture with the solar installer case study.",
  ],
  [
    "Partner event",
    "Partner day Vienna",
    "partnerEvent",
    "sofiaRossi",
    9_500,
    -190,
    -189,
    "Co-hosted with Alpenrand Digital for Austrian prospects.",
  ],
  [
    "Webinar",
    "SLA reporting for elevator service",
    "webinar",
    "elenaHoffmann",
    4_000,
    -120,
    -100,
    "Panel with two customers on SLA dashboards.",
  ],
  [
    "Trade fair",
    "InterService Expo Cologne",
    "tradeFair",
    "maxBergmann",
    41_000,
    -60,
    -57,
    "Second trade fair; launched route planning for Starter upgrades.",
  ],
] as const;

const CAMPAIGN_LEAD_SOURCE: Record<Option<"campaign.channel">, LeadSource> = {
  webinar: "webinar",
  tradeFair: "tradeFair",
  linkedinAds: "linkedin",
  googleAds: "paidSearch",
  email: "contentDownload",
  partnerEvent: "partnerReferral",
};

/** Partner tiers: Referral 10 percent of first-year value, Silver reseller 20 percent, Gold implementation 25. */
const PARTNERS = [
  ["Brückner Field Consulting", "gold", "dach", "brueckner-field.example", 25, 12_000],
  ["Alpenrand Digital", "gold", "dach", "alpenrand-digital.example", 25, 12_000],
  ["Lowlands Service IT", "silver", "benelux", "lowlands-service-it.example", 20, 6_000],
  ["Fjordline Systems", "silver", "nordics", "fjordline-systems.example", 20, 6_000],
  ["Keystone Field Advisory", "registered", "ukIreland", "keystone-field.example", 10, 0],
  ["Facility Service Association Hessen", "registered", "dach", "fsa-hessen.example", 10, 0],
] as const;

const OPEN_ROLES = [
  ["Senior Backend Engineer", "engineering", "open", "maxBergmann", 85_000, 45],
  ["Account Executive DACH", "sales", "open", "sofiaRossi", 70_000, 30],
  ["Customer Success Manager", "customerSuccess", "open", "elenaHoffmann", 62_000, 40],
  ["Support Engineer (2nd level)", "support", "onHold", "kianRahimi", 55_000, 75],
  ["Product Marketing Manager", "marketing", "open", "maxBergmann", 68_000, 60],
  ["Working Student Operations", "operations", "filled", "lauraFischer", 18_000, -20],
] as const;

const TICKET_SUBJECTS: ReadonlyArray<readonly [string, Option<"ticket.category">[]]> = [
  ["Route plan not syncing to mobile app", ["routing", "mobileApp"]],
  ["Optimized routes start at the wrong depot", ["routing"]],
  ["Travel times too short in rural areas", ["routing"]],
  ["Offline jobs not syncing from technician app", ["mobileApp"]],
  ["Photos missing on completed service reports", ["mobileApp"]],
  ["Signature capture freezes on older tablets", ["mobileApp"]],
  ["Push notifications arrive twice", ["mobileApp"]],
  ["SAP work orders stop importing overnight", ["integrations"]],
  ["Dynamics customer sync creates duplicates", ["integrations", "dataImport"]],
  ["Webhook to ticketing tool returns 401", ["integrations"]],
  ["CSV import of assets rejects dates", ["dataImport"]],
  ["Maintenance intervals lost after import", ["dataImport"]],
  ["Invoice shows the wrong seat count", ["billing"]],
  ["Copy of last year's invoices needed", ["billing"]],
  ["Dispatcher cannot sign in after SSO change", ["access"]],
  ["New technician did not receive the invite", ["access"]],
  ["Role permissions hide the scheduling board", ["access", "routing"]],
  ["Recurring jobs skip public holidays incorrectly", ["routing"]],
  ["Map tiles not loading on the scheduling board", ["routing", "mobileApp"]],
  ["SLA compliance report export times out", ["integrations"]],
];

/** Days from opening until a ticket of each priority is due. */
const SLA_DAYS: Record<Option<"ticket.priority">, number> = { urgent: 0, high: 1, normal: 2, low: 4 };

/** Builds the full dataset. Pure and deterministic. */
export function buildNorthwindDataset(): NorthwindDataset {
  const rng = random(20261011);

  // Organizations -------------------------------------------------------------------------------------------------
  const usedNames = new Set<string>();
  const organizationsBase = Array.from({ length: 120 }, (_, index) => {
    const industry = rng.weighted(INDUSTRY_WEIGHTS);
    let name = "";
    let stem = "";
    for (let attempt = 0; attempt < 60 && (!name || usedNames.has(name)); attempt++) {
      stem = ORGANIZATION_STEMS[(index + attempt * 7) % ORGANIZATION_STEMS.length] as string;
      name = `${stem} ${rng.pick(INDUSTRY_SUFFIXES[industry])}`;
    }
    usedNames.add(name);
    const segment = rng.weighted<Segment>([
      ["smb", 35],
      ["midMarket", 50],
      ["enterprise", 15],
    ]);
    const companySize =
      segment === "smb" ? rng.int(5, 18) * 10 : segment === "midMarket" ? rng.int(20, 100) * 10 : rng.int(12, 40) * 100;
    const slug = name
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/ and /g, "-")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return {
      index,
      name,
      shortName: stem,
      domain: `${slug}.example`,
      industry,
      segment,
      companySize,
      leadSource: rng.weighted(LEAD_SOURCE_WEIGHTS),
    };
  });

  // Campaigns and partners -----------------------------------------------------------------------------------------
  const campaigns: NorthwindCampaign[] = CAMPAIGNS.map(
    ([type, topic, channel, ownerKey, budget, from, to, notes], index) => {
      const startMs = Math.floor((END + from * DAY) / DAY) * DAY;
      const endMs = Math.floor((END + to * DAY) / DAY) * DAY;
      const start = northwindAt(startMs);
      const quarter = Math.floor(start.getUTCMonth() / 3) + 1;
      return {
        index,
        id: fixtureId(NORTHWIND_RECORD_ID_PREFIXES.campaign, index + 1),
        name: `${start.getUTCFullYear()}-Q${quarter} ${type} ${topic}`,
        channel,
        ownerKey,
        budget,
        actualSpend:
          endMs < END ? Math.round((budget * (0.86 + rng.next() * 0.18)) / 100) * 100 : Math.round(budget * 0.7),
        startMs,
        endMs,
        notes,
      };
    },
  );
  const partners: NorthwindPartner[] = PARTNERS.map(
    ([name, tier, region, domain, commissionRate, annualFee], index) => ({
      index,
      id: fixtureId(NORTHWIND_RECORD_ID_PREFIXES.partner, index + 1),
      name,
      tier,
      region,
      website: `https://www.${domain}`,
      commissionRate,
      annualFee,
      createdAtMs: workTime(rng, START + (10 + index * 50) * DAY),
    }),
  );

  // Organization profiles ------------------------------------------------------------------------------------------
  const LEGACY = 30;
  const FORMER = 6;
  const order = organizationsBase.map((organization) => organization.index).sort(() => rng.next() - 0.5);
  const legacy = order.slice(0, LEGACY);
  const formers = order.slice(LEGACY, LEGACY + FORMER);
  const open = order.slice(LEGACY + FORMER);
  const customerSince = new Map<number, number>();
  for (const organizationIndex of legacy) customerSince.set(organizationIndex, START - rng.int(30, 700) * DAY);
  for (const organizationIndex of formers) customerSince.set(organizationIndex, START - rng.int(380, 700) * DAY);

  const planFor = (segment: Segment): Plan =>
    segment === "enterprise" ? "enterprise" : segment === "smb" && rng.chance(0.65) ? "starter" : "professional";
  const seatsFor = (plan: Plan, segment: Segment): number =>
    Math.max(
      MINIMUM_SEATS[plan],
      segment === "smb" ? rng.int(10, 40) : segment === "midMarket" ? rng.int(25, 160) : rng.int(90, 380),
    );

  // Deals -------------------------------------------------------------------------------------------------------------
  const deals: NorthwindDeal[] = [];
  const lineItems: NorthwindLineItem[] = [];
  const owners = (createdAtMs: number, segment: Segment): MemberKey => {
    if (segment === "enterprise" && rng.chance(0.3)) return "sofiaRossi";
    const available = (["claraNeumann", "marcoSilva", "sofiaRossi"] as const).filter(
      (key) => MEMBER_JOINED[key] < createdAtMs,
    );
    return rng.pick(available);
  };
  const addDeal = (input: {
    type: DealType;
    organizationIndex: number;
    createdAtMs: number;
    closeAtMs: number;
    status: DealStatus;
    stage: DealStage;
    previousStage: DealStage | null;
    lostReason: LostReason | null;
    plan: Plan;
    seats: number;
    ownerKey: MemberKey;
    leadSource: LeadSource;
    campaignIndex: number | null;
    partnerIndex: number | null;
    subscriptionIndex: number | null;
    extraDiscount: number;
  }) => {
    const organization = organizationsBase[input.organizationIndex];
    const index = deals.length;
    const volume = input.seats >= 250 ? 0.1 : input.seats >= 100 ? 0.05 : 0;
    const discount = Math.min(0.3, volume + input.extraDiscount);
    const lines: Array<[number, number]> = [[SEAT_SERVICE[input.plan], input.seats]];
    if (input.type === "new") {
      lines.push([ONBOARDING_SERVICE[input.plan], 1]);
      if (input.plan !== "starter" && rng.chance(0.55)) lines.push([SERVICE.integrationDay, rng.int(2, 8)]);
      if (rng.chance(0.4)) lines.push([SERVICE.trainingDay, rng.int(1, 3)]);
    } else if (input.type === "expansion" && rng.chance(0.3)) lines.push([SERVICE.trainingDay, 1]);
    let totalValue = 0;
    let listValue = 0;
    for (const [lineIndex, [serviceIndex, quantity]] of lines.entries()) {
      const price = NORTHWIND_SERVICES[serviceIndex][1];
      // Exact percentages keep the line's Discount % exact: 348 at 5 percent off is 330.6.
      const savedPrice = lineIndex === 0 && discount > 0 ? (price * Math.round(100 - discount * 100)) / 100 : null;
      totalValue += (savedPrice ?? price) * quantity;
      listValue += price * quantity;
      lineItems.push({
        index: lineItems.length,
        id: fixtureId("12000000", lineItems.length + 1),
        dealIndex: index,
        serviceIndex,
        quantity,
        savedPrice,
      });
    }
    totalValue = Math.round(totalValue * 100) / 100;
    listValue = Math.round(listValue * 100) / 100;
    deals.push({
      index,
      id: fixtureId("80000000", index + 1),
      name: `${organization.name} - ${PLAN_LABEL[input.plan]} ${input.seats} - ${TYPE_LABEL[input.type]}`,
      type: input.type,
      organizationIndex: input.organizationIndex,
      contactIndexes: [],
      ownerKey: input.ownerKey,
      createdAtMs: input.createdAtMs,
      closeAtMs: input.closeAtMs,
      status: input.status,
      stage: input.stage,
      previousStage: input.previousStage,
      lostReason: input.lostReason,
      leadSource: input.leadSource,
      plan: input.plan,
      seats: input.seats,
      discountPercent: Math.round(discount * 100),
      totalValue,
      listValue,
      campaignIndex: input.campaignIndex,
      partnerIndex: input.partnerIndex,
      subscriptionIndex: input.subscriptionIndex,
      notes: null,
    });
    return deals[index];
  };
  const extraDiscount = () =>
    rng.weighted<number>([
      [0, 45],
      [0.05, 20],
      [0.1, 20],
      [0.15, 10],
      [0.2, 5],
    ]);
  const lostReason = (): LostReason =>
    rng.weighted<LostReason>([
      ["price", 24],
      ["noDecision", 22],
      ["competitor", 20],
      ["timing", 16],
      ["productGap", 10],
      ["notAFit", 8],
    ]);

  // New and expansion deals: monthly volume grows about 6 percent a month with summer and December dips.
  const NEW_AND_EXPANSION = 151;
  const season = [1.0, 1.05, 1.2, 1.1, 1.0, 0.95, 0.75, 0.7, 1.1, 1.2, 1.1, 0.75];
  const monthDays = NORTHWIND_HISTORY_DAYS / 18;
  const months = Array.from({ length: 18 }, (_, month) => {
    const startMs = START + month * monthDays * DAY;
    return { startMs, weight: (1 + 0.06 * month) * (season[northwindAt(startMs).getUTCMonth()] ?? 1) };
  });
  const totalWeight = months.reduce((sum, month) => sum + month.weight, 0);
  const counts = months.map((month) => Math.floor((NEW_AND_EXPANSION * month.weight) / totalWeight));
  for (let month = 17; counts.reduce((sum, value) => sum + value, 0) < NEW_AND_EXPANSION; month = (month + 17) % 18)
    counts[month] = (counts[month] ?? 0) + 1;
  const created = months
    .flatMap((month, monthIndex) =>
      Array.from({ length: counts[monthIndex] ?? 0 }, () =>
        workTime(rng, month.startMs + rng.int(0, Math.floor(monthDays) - 1) * DAY),
      ),
    )
    .sort((a, b) => a - b);
  const prospects = [...open];
  const wonNew: NorthwindDeal[] = [];
  for (const createdAtMs of created) {
    const expansionPool = [...customerSince].filter(
      ([organizationIndex, since]) => since < createdAtMs - 45 * DAY && !formers.includes(organizationIndex),
    );
    const type: DealType = expansionPool.length && rng.chance(0.22) ? "expansion" : "new";
    const cycle = type === "expansion" ? rng.int(14, 45) : rng.int(30, 110);
    const closeAtMs = workTime(rng, createdAtMs + cycle * DAY);
    const isOpen = closeAtMs > END - 2 * DAY;
    const status: DealStatus = isOpen
      ? "open"
      : rng.weighted<DealStatus>(
          type === "expansion"
            ? [
                ["won", 72],
                ["lost", 20],
                ["abandoned", 8],
              ]
            : [
                ["won", 46],
                ["lost", 42],
                ["abandoned", 12],
              ],
        );
    const elapsed = (END - createdAtMs) / (closeAtMs - createdAtMs);
    const stage: DealStage = isOpen
      ? elapsed < 0.3
        ? "new"
        : elapsed < 0.65
          ? "qualified"
          : "proposal"
      : status === "won"
        ? "won"
        : "lost";
    const previousStage: DealStage | null = isOpen
      ? null
      : status === "won"
        ? "proposal"
        : rng.pick<DealStage>(["new", "qualified", "proposal"]);
    let organizationIndex: number;
    if (type === "expansion") organizationIndex = rng.pick(expansionPool)[0];
    else if (status === "won" || isOpen) {
      const available = prospects.filter((candidate) => !customerSince.has(candidate));
      organizationIndex = available.length ? rng.pick(available) : rng.pick(open);
    } else organizationIndex = rng.chance(0.85) ? rng.pick(prospects) : rng.pick(formers);
    const organization = organizationsBase[organizationIndex];
    const matching = campaigns.filter(
      (candidate) => candidate.startMs <= createdAtMs && createdAtMs - candidate.endMs < 75 * DAY,
    );
    const campaign = matching.length ? rng.pick(matching) : undefined;
    const partner = type === "new" && rng.chance(0.14) ? rng.pick(partners) : null;
    const campaignIndex = type === "new" && campaign && rng.chance(0.6) ? campaign.index : null;
    const leadSource: LeadSource =
      type !== "new"
        ? "customerReferral"
        : partner
          ? "partnerReferral"
          : campaignIndex !== null
            ? CAMPAIGN_LEAD_SOURCE[campaigns[campaignIndex].channel]
            : organization.leadSource;
    if (type === "new" && !customerSince.has(organizationIndex)) organization.leadSource = leadSource;
    const plan = type === "expansion" ? planFor(organization.segment) : planFor(organization.segment);
    const deal = addDeal({
      type,
      organizationIndex,
      createdAtMs,
      closeAtMs,
      status,
      stage,
      previousStage,
      lostReason: status === "lost" ? lostReason() : status === "abandoned" ? "noDecision" : null,
      plan,
      seats: type === "expansion" ? rng.int(2, 12) * 5 : seatsFor(plan, organization.segment),
      ownerKey: owners(createdAtMs, organization.segment),
      leadSource,
      campaignIndex,
      partnerIndex: partner?.index ?? null,
      subscriptionIndex: null,
      extraDiscount: extraDiscount(),
    });
    if (type === "new" && status === "won") {
      customerSince.set(organizationIndex, closeAtMs);
      wonNew.push(deal);
    }
  }

  // A campaign's cost per deal divides its spend by the deals it sourced; calculations keep exact decimals only, so
  // each campaign keeps a count of sourced deals made of the factors 2 and 5 (the rest keep only their lead source).
  for (const campaign of campaigns) {
    const sourced = deals.filter((deal) => deal.campaignIndex === campaign.index);
    const keep = [20, 16, 10, 8, 5, 4, 2, 1].find((count) => count <= sourced.length) ?? 0;
    for (const deal of sourced.slice(keep)) deal.campaignIndex = null;
  }

  // Organizations (final) ------------------------------------------------------------------------------------------
  const firstDeal = new Map<number, number>();
  for (const deal of deals)
    if (!firstDeal.has(deal.organizationIndex)) firstDeal.set(deal.organizationIndex, deal.createdAtMs);
  const organizations: NorthwindOrganization[] = organizationsBase.map((base) => {
    const profile: NorthwindProfile = legacy.includes(base.index)
      ? "legacyCustomer"
      : formers.includes(base.index)
        ? "formerCustomer"
        : customerSince.has(base.index)
          ? "newCustomer"
          : "prospect";
    const createdAtMs =
      profile === "legacyCustomer" || profile === "formerCustomer"
        ? workTime(rng, START + rng.int(0, 20) * DAY)
        : workTime(rng, (firstDeal.get(base.index) ?? START + rng.int(30, 520) * DAY) - rng.int(1, 12) * DAY);
    return {
      ...base,
      id: fixtureId("70000000", base.index + 1),
      website: `https://www.${base.domain}`,
      profile,
      customerSince: customerSince.get(base.index) ?? null,
      createdAtMs: Math.max(createdAtMs, START + HOUR),
      notes: null,
    };
  });

  // Subscriptions: one per customer, a few second sites; renewals land in the next twelve months -----------------
  const subscriptions: NorthwindSubscription[] = [];
  const addSubscription = (organizationIndex: number, deal: NorthwindDeal | null, suffix = "") => {
    const organization = organizations[organizationIndex];
    const plan = deal?.plan ?? planFor(organization.segment);
    const startMs = deal ? deal.closeAtMs + 14 * DAY : (customerSince.get(organizationIndex) ?? START);
    const expansions = suffix
      ? 0
      : deals
          .filter(
            (candidate) =>
              candidate.type === "expansion" &&
              candidate.status === "won" &&
              candidate.organizationIndex === organizationIndex,
          )
          .reduce((sum, candidate) => sum + candidate.seats, 0);
    const seats = (deal?.seats ?? seatsFor(plan, organization.segment)) + expansions;
    const pricePerSeat = NORTHWIND_SEAT_PRICES[plan];
    const annualPrice =
      plan === "enterprise" && seats >= 250 ? Math.round((seats * pricePerSeat * 12 * 0.9) / 100) * 100 : null;
    let renewalMs = startMs;
    while (renewalMs <= END) renewalMs += 365 * DAY;
    const health = rng.weighted<Option<"subscription.health">>([
      ["healthy", 72],
      ["watch", 17],
      ["atRisk", 11],
    ]);
    subscriptions.push({
      index: subscriptions.length,
      id: fixtureId(NORTHWIND_RECORD_ID_PREFIXES.subscription, subscriptions.length + 1),
      name: `${organization.name} - ${PLAN_LABEL[plan]}${suffix}`,
      organizationIndex,
      dealIndex: deal?.index ?? null,
      plan,
      billing: annualPrice ? "annualPrice" : "perSeat",
      seats,
      pricePerSeat,
      annualPrice,
      arr: annualPrice ?? seats * pricePerSeat * 12,
      startMs,
      renewalMs,
      health,
      previousHealth: health === "healthy" ? null : rng.chance(0.6) ? "healthy" : null,
      createdAtMs: deal ? workTime(rng, deal.closeAtMs + DAY) : workTime(rng, START + rng.int(0, 20) * DAY),
    });
    if (deal) deal.subscriptionIndex = subscriptions.length - 1;
  };
  for (const organizationIndex of legacy) addSubscription(organizationIndex, null);
  for (const deal of wonNew) addSubscription(deal.organizationIndex, deal);
  const largest = legacy
    .filter((candidate) => organizations[candidate].segment !== "smb")
    .sort((a, b) => organizations[b].companySize - organizations[a].companySize);
  for (let cursor = 0; subscriptions.length < 90; cursor++)
    addSubscription(largest[cursor % largest.length], null, cursor < 4 ? " - second region" : " - pilot site");

  if (subscriptions.length > 90) throw new Error(`Northwind generated ${subscriptions.length} subscriptions`);

  // Renewal deals: legacy anniversaries inside the story were renewed, former customers churned, and renewals due in
  // the next 90 days are open in Qualified.
  for (const subscription of subscriptions.filter((candidate) => candidate.dealIndex === null)) {
    const anniversary = subscription.renewalMs - 365 * DAY;
    if (anniversary > START + 60 * DAY && anniversary < END - 20 * DAY) {
      const organization = organizations[subscription.organizationIndex];
      addDeal({
        type: "renewal",
        organizationIndex: subscription.organizationIndex,
        createdAtMs: workTime(rng, anniversary - 90 * DAY),
        closeAtMs: workTime(rng, anniversary - rng.int(5, 30) * DAY),
        status: "won",
        stage: "won",
        previousStage: "proposal",
        lostReason: null,
        plan: subscription.plan,
        seats: subscription.seats,
        ownerKey: "elenaHoffmann",
        leadSource: organization.leadSource,
        campaignIndex: null,
        partnerIndex: null,
        subscriptionIndex: subscription.index,
        extraDiscount: 0,
      });
    }
  }
  for (const organizationIndex of formers) {
    const organization = organizations[organizationIndex];
    const since = customerSince.get(organizationIndex) ?? START;
    let anniversary = since;
    while (anniversary < START + 60 * DAY) anniversary += 365 * DAY;
    if (anniversary > END - 20 * DAY) anniversary = END - rng.int(30, 200) * DAY;
    const plan = planFor(organization.segment);
    addDeal({
      type: "renewal",
      organizationIndex,
      createdAtMs: workTime(rng, anniversary - 90 * DAY),
      closeAtMs: workTime(rng, anniversary - rng.int(1, 20) * DAY),
      status: "lost",
      stage: "lost",
      previousStage: "qualified",
      lostReason: rng.pick<LostReason>(["price", "competitor", "productGap"]),
      plan,
      seats: seatsFor(plan, organization.segment),
      ownerKey: "elenaHoffmann",
      leadSource: organization.leadSource,
      campaignIndex: null,
      partnerIndex: null,
      subscriptionIndex: null,
      extraDiscount: 0,
    });
  }
  for (const subscription of subscriptions.filter((candidate) => candidate.renewalMs < END + 90 * DAY)) {
    const organization = organizations[subscription.organizationIndex];
    const createdAtMs = workTime(rng, Math.min(END - DAY, subscription.renewalMs - 90 * DAY));
    addDeal({
      type: "renewal",
      organizationIndex: subscription.organizationIndex,
      createdAtMs,
      closeAtMs: workTime(rng, Math.max(subscription.renewalMs - 10 * DAY, END + 3 * DAY)),
      status: "open",
      stage: subscription.renewalMs - END < 45 * DAY ? "proposal" : "qualified",
      previousStage: null,
      lostReason: null,
      plan: subscription.plan,
      seats: subscription.seats,
      ownerKey: "elenaHoffmann",
      leadSource: organization.leadSource,
      campaignIndex: null,
      partnerIndex: null,
      subscriptionIndex: subscription.index,
      extraDiscount: 0,
    });
  }
  // Deal ids follow creation time so the newest deals sort last by id as well.
  deals.sort((a, b) => a.createdAtMs - b.createdAtMs);
  const dealIndexMap = new Map(deals.map((deal, index) => [deal.index, index]));
  for (const [index, deal] of deals.entries()) {
    deal.index = index;
    deal.id = fixtureId("80000000", index + 1);
  }
  for (const line of lineItems) line.dealIndex = dealIndexMap.get(line.dealIndex) as number;
  lineItems.sort((a, b) => a.dealIndex - b.dealIndex || a.index - b.index);
  for (const [index, line] of lineItems.entries()) {
    line.index = index;
    line.id = fixtureId("12000000", index + 1);
  }
  for (const subscription of subscriptions)
    if (subscription.dealIndex !== null) subscription.dealIndex = dealIndexMap.get(subscription.dealIndex) as number;
  const seenNames = new Map<string, number>();
  for (const deal of deals) {
    const seen = seenNames.get(deal.name) ?? 0;
    seenNames.set(deal.name, seen + 1);
    if (seen) deal.name = `${deal.name} ${northwindAt(deal.createdAtMs).getUTCFullYear()}${seen > 1 ? `-${seen}` : ""}`;
  }

  // Contacts: about three per organization; the named contacts lead the biggest customer accounts --------------------
  const contacts: NorthwindContact[] = [];
  const usedPeople = new Set<string>();
  const ranked = [...organizations].sort(
    (a, b) =>
      Number(b.profile === "legacyCustomer" || b.profile === "newCustomer") -
        Number(a.profile === "legacyCustomer" || a.profile === "newCustomer") || b.companySize - a.companySize,
  );
  const addContact = (
    organization: NorthwindOrganization,
    firstName: string,
    lastName: string,
    avatarUrl: string | null,
  ) => {
    const [jobTitle, role] = rng.weighted(
      JOB_TITLES.map(([title, dealRole, weight]) => [[title, dealRole] as const, weight] as const),
    );
    const handle = `${firstName}-${lastName}`
      .toLowerCase()
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z-]+/g, "");
    const roles = rng.chance(0.3) && role !== "user" ? [role, "influencer" as const] : [role];
    const index = contacts.length;
    contacts.push({
      index,
      id: fixtureId("60000000", index + 1),
      firstName,
      lastName,
      avatarUrl,
      email: `${handle.replace(/-/g, ".")}@${organization.domain}`,
      phone: `+4930${String(5550000 + index * 37).padStart(8, "0")}`,
      linkedin: avatarUrl === null && rng.chance(0.4) ? `${handle}-${(index * 7919) % 9000}` : null,
      jobTitle,
      dealRoles: [...new Set(roles)],
      organizationIndex: organization.index,
      leadSource: organization.leadSource,
      lifecycle:
        organization.profile === "prospect"
          ? rng.pick(["new", "contact", "qualified", "inProgress", "lost"] as const)
          : organization.profile === "formerCustomer"
            ? "lost"
            : "won",
      createdAtMs: Math.min(workTime(rng, organization.createdAtMs + rng.int(0, 40) * DAY), END - DAY),
    });
    usedPeople.add(`${firstName} ${lastName}`);
  };
  NORTHWIND_NAMED_CONTACTS.forEach(([firstName, lastName], index) =>
    addContact(ranked[index], firstName, lastName, SYNTHETIC_CONTACT_AVATAR_URLS[index] ?? null),
  );
  for (let organizationIndex = 0; contacts.length < 350; organizationIndex = (organizationIndex + 1) % 120) {
    const organization = organizations[organizationIndex];
    const existing = contacts.filter((contact) => contact.organizationIndex === organization.index).length;
    const target = organization.segment === "enterprise" ? 5 : organization.profile === "prospect" ? 2 : 3;
    if (existing >= target && rng.chance(0.85)) continue;
    let firstName: string = rng.pick(FIRST_NAMES);
    let lastName: string = rng.pick(LAST_NAMES);
    while (usedPeople.has(`${firstName} ${lastName}`)) {
      firstName = rng.pick(FIRST_NAMES);
      lastName = rng.pick(LAST_NAMES);
    }
    addContact(organization, firstName, lastName, null);
  }
  const contactsOf = (organizationIndex: number) =>
    contacts.filter((contact) => contact.organizationIndex === organizationIndex);
  for (const deal of deals) {
    const people = contactsOf(deal.organizationIndex);
    deal.contactIndexes = people.slice(0, rng.int(1, Math.min(3, people.length))).map((contact) => contact.index);
  }

  // Onboarding projects for the 25 most recent new customers ---------------------------------------------------------
  const phases: ReadonlyArray<readonly [number, Option<"onboarding.phase">, number]> = [
    [95, "completed", 100],
    [70, "hypercare", 90],
    [52, "goLive", 75],
    [34, "pilot", 55],
    [14, "configuration", 30],
    [-1000, "kickoff", 5],
  ];
  const onboardings: NorthwindOnboarding[] = deals
    .filter((deal) => deal.type === "new" && deal.status === "won")
    .slice(-25)
    .map((deal, index) => {
      const organization = organizations[deal.organizationIndex];
      const age = (END - deal.closeAtMs) / DAY;
      const [, phase, progress] = phases.find(([minimum]) => age > minimum) ?? phases[5];
      const startMs = deal.closeAtMs + 2 * DAY;
      return {
        index,
        id: fixtureId(NORTHWIND_RECORD_ID_PREFIXES.onboarding, index + 1),
        name: `${organization.name} onboarding`,
        dealIndex: deal.index,
        organizationIndex: deal.organizationIndex,
        subscriptionIndex: deal.subscriptionIndex,
        ownerKey: rng.chance(0.8) ? "elenaHoffmann" : "maxBergmann",
        phase,
        progress,
        startMs,
        endMs: startMs + (deal.plan === "starter" ? 21 : deal.plan === "professional" ? 42 : 84) * DAY,
        createdAtMs: workTime(rng, deal.closeAtMs + DAY),
      };
    });

  // Tickets ------------------------------------------------------------------------------------------------------------
  const tickets: NorthwindTicket[] = Array.from({ length: 150 }, (_, index) => {
    const recent = index >= 133;
    const openedMs = recent
      ? workTime(rng, END - rng.int(0, 9) * DAY)
      : workTime(rng, START + Math.floor(Math.sqrt(rng.next()) * (NORTHWIND_HISTORY_DAYS - 12)) * DAY);
    const active = subscriptions.filter((subscription) => subscription.startMs < openedMs);
    const subscription = rng.pick(active.length ? active : subscriptions);
    const people = contactsOf(subscription.organizationIndex);
    const contact = rng.pick(people.length ? people : contacts);
    const [subject, categories] = rng.pick(TICKET_SUBJECTS);
    const priority = rng.weighted<Option<"ticket.priority">>([
      ["urgent", 6],
      ["high", 22],
      ["normal", 50],
      ["low", 22],
    ]);
    const slaDueMs = Math.floor(openedMs / DAY) * DAY + SLA_DAYS[priority] * DAY;
    const late = rng.chance(0.1);
    const resolvedMs = recent
      ? null
      : late
        ? slaDueMs + rng.int(1, 4) * DAY
        : openedMs + rng.int(1, Math.max(4, SLA_DAYS[priority] * 18 + 6)) * HOUR;
    const status: Option<"ticket.status"> = recent
      ? (["waitingOnCustomer", "open", "new"] as const)[index % 3]
      : rng.chance(0.6)
        ? "closed"
        : "resolved";
    return {
      index,
      id: "",
      name: subject,
      subscriptionIndex: subscription.index,
      contactIndex: contact.index,
      priority,
      status,
      categories: [...categories],
      assigneeKey: (MEMBER_JOINED.kianRahimi < openedMs && rng.chance(0.8)
        ? "kianRahimi"
        : "elenaHoffmann") as MemberKey,
      openedMs,
      slaDueMs,
      lastResponseMs: recent ? Math.max(openedMs, END - rng.int(0, 1) * DAY) : (resolvedMs as number),
      resolvedMs,
    };
  }).sort((a, b) => a.openedMs - b.openedMs);
  tickets.forEach((ticket, index) => {
    ticket.index = index;
    ticket.id = fixtureId(NORTHWIND_RECORD_ID_PREFIXES.ticket, index + 1);
  });
  for (const ticket of tickets.filter((candidate) => candidate.resolvedMs === null && candidate.slaDueMs < END - DAY)) {
    const subscription = subscriptions[ticket.subscriptionIndex];
    if (subscription.health === "healthy") {
      subscription.previousHealth = "healthy";
      subscription.health = ticket.priority === "urgent" || ticket.priority === "high" ? "atRisk" : "watch";
    }
  }

  // Hiring ---------------------------------------------------------------------------------------------------------------
  const openRoles: NorthwindOpenRole[] = OPEN_ROLES.map(
    ([name, department, status, hiringManagerKey, salaryBudget, startIn], index) => ({
      index,
      id: fixtureId(NORTHWIND_RECORD_ID_PREFIXES.openRole, index + 1),
      name,
      department,
      status,
      hiringManagerKey,
      salaryBudget,
      targetStartMs: Math.floor((END + startIn * DAY) / DAY) * DAY,
      createdAtMs: workTime(rng, END - rng.int(90, 160) * DAY),
    }),
  );
  const interviewNotes = [
    "Scorecard: strong on fundamentals and walked through a past project in detail.",
    "Asked good questions about how dispatchers and technicians use the app.",
    "Notice period three months; salary expectation within the band.",
    "Recommend a case task with the team lead as the next step.",
    "Clear communication; would like more ownership than in the current role.",
  ];
  const candidates: NorthwindCandidate[] = Array.from({ length: 40 }, (_, index) => {
    const role = openRoles[index % openRoles.length];
    let firstName: string = rng.pick(FIRST_NAMES);
    let lastName: string = rng.pick(LAST_NAMES);
    while (usedPeople.has(`${firstName} ${lastName}`)) {
      firstName = rng.pick(FIRST_NAMES);
      lastName = rng.pick(LAST_NAMES);
    }
    usedPeople.add(`${firstName} ${lastName}`);
    const stage: Option<"candidate.stage"> =
      role.status === "filled"
        ? index === 5
          ? "hired"
          : "rejected"
        : rng.weighted<Option<"candidate.stage">>([
            ["applied", 24],
            ["screening", 20],
            ["interview", 18],
            ["caseTask", 8],
            ["offer", 5],
            ["rejected", 25],
          ]);
    const interviewed =
      ["interview", "caseTask", "offer", "hired"].includes(stage) || (stage === "rejected" && rng.chance(0.4));
    const handle = `${firstName}.${lastName}`
      .toLowerCase()
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z.]+/g, "");
    return {
      index,
      id: fixtureId(NORTHWIND_RECORD_ID_PREFIXES.candidate, index + 1),
      name: `${firstName} ${lastName}`,
      openRoleIndex: role.index,
      stage,
      source: rng.weighted<Option<"candidate.source">>([
        ["linkedin", 40],
        ["referral", 20],
        ["careersPage", 30],
        ["agency", 10],
      ]),
      email: `${handle}@mail.example`,
      appliedMs: workTime(rng, Math.max(role.createdAtMs, END - rng.int(3, 120) * DAY)),
      salaryExpectation: Math.round((role.salaryBudget * (0.85 + rng.next() * 0.3)) / 1000) * 1000,
      interviewerKey: interviewed ? role.hiringManagerKey : null,
      interviewNotes: interviewed ? [rng.pick(interviewNotes), rng.pick(interviewNotes)] : null,
    };
  });

  // Tasks for every team -------------------------------------------------------------------------------------------------
  const tasks: NorthwindTask[] = [];
  type TaskInput = Omit<
    NorthwindTask,
    "index" | "id" | "contactIndexes" | "organizationIndexes" | "dealIndexes" | "serviceIndexes"
  > &
    Partial<Pick<NorthwindTask, "contactIndexes" | "organizationIndexes" | "dealIndexes" | "serviceIndexes">>;
  const addTask = (task: TaskInput) =>
    tasks.push({
      contactIndexes: [],
      organizationIndexes: [],
      dealIndexes: [],
      serviceIndexes: [],
      ...task,
      createdAtMs: Math.min(task.createdAtMs, END - HOUR),
      index: tasks.length,
      id: fixtureId("a0000000", tasks.length + 1),
    });
  const statusFor = (dueMs: number): NorthwindTask["status"] =>
    dueMs < END - 10 * DAY
      ? rng.chance(0.92)
        ? "done"
        : "archived"
      : rng.weighted<NorthwindTask["status"]>([
          ["open", 45],
          ["inProgress", 35],
          ["blocked", 8],
          ["onHold", 12],
        ]);
  const salesTemplates = [
    "Send the quote to {org}",
    "Follow up after the demo with {contact}",
    "Check the discount on {deal} against the pricing rules",
    "Book a discovery call with {org}",
    "Confirm the decision timeline with {contact}",
  ];
  const salesDeals = [
    ...deals.filter((deal) => deal.status === "open" && deal.type !== "renewal"),
    ...deals.filter((deal) => deal.status !== "open" && deal.type !== "renewal").slice(-12),
  ];
  for (const [index, deal] of salesDeals.entries()) {
    const organization = organizations[deal.organizationIndex];
    const contact = contacts[deal.contactIndexes[0] ?? 0];
    const dueMs = deal.status === "open" ? END + rng.int(-3, 14) * DAY : deal.closeAtMs - rng.int(2, 10) * DAY;
    addTask({
      name: salesTemplates[index % salesTemplates.length]
        .replace("{org}", organization.name)
        .replace("{contact}", `${contact.firstName} ${contact.lastName}`)
        .replace("{deal}", deal.name),
      team: "sales",
      status: deal.status === "open" ? statusFor(dueMs) : "done",
      priority: deal.totalValue > 80_000 ? "high" : deal.totalValue > 30_000 ? "medium" : "low",
      assigneeKey: deal.ownerKey,
      dueMs,
      createdAtMs: workTime(rng, Math.max(deal.createdAtMs, dueMs - 12 * DAY)),
      dealIndexes: [deal.index],
      organizationIndexes: [deal.organizationIndex],
      contactIndexes: index % 5 === 1 || index % 5 === 4 ? [contact.index] : [],
    });
  }
  for (const deal of deals.filter((candidate) => candidate.lostReason === "timing").slice(-6)) {
    const dueMs = deal.closeAtMs + 182 * DAY;
    addTask({
      name: `Reconnect with ${organizations[deal.organizationIndex].name} (lost on timing)`,
      team: "sales",
      status: statusFor(dueMs),
      priority: "low",
      assigneeKey: deal.ownerKey,
      dueMs,
      createdAtMs: workTime(rng, deal.closeAtMs + DAY),
      dealIndexes: [deal.index],
      organizationIndexes: [deal.organizationIndex],
    });
  }
  for (const subscription of subscriptions.filter((candidate) => candidate.renewalMs < END + 90 * DAY)) {
    const organization = organizations[subscription.organizationIndex];
    const dueMs = subscription.renewalMs - 60 * DAY;
    addTask({
      name: `Renewal review with ${organization.name}`,
      team: "customerSuccess",
      status: statusFor(dueMs),
      priority: subscription.health === "atRisk" ? "high" : "medium",
      assigneeKey: "elenaHoffmann",
      dueMs,
      createdAtMs: workTime(rng, subscription.renewalMs - 90 * DAY),
      organizationIndexes: [organization.index],
    });
  }
  for (const subscription of subscriptions.filter((candidate) => candidate.health === "atRisk").slice(0, 8)) {
    const organization = organizations[subscription.organizationIndex];
    const dueMs = END + rng.int(1, 10) * DAY;
    addTask({
      name: `Recovery plan for ${organization.name}`,
      team: "customerSuccess",
      status: statusFor(dueMs),
      priority: "high",
      assigneeKey: "elenaHoffmann",
      dueMs,
      createdAtMs: workTime(rng, END - rng.int(3, 20) * DAY),
      organizationIndexes: [organization.index],
    });
  }
  for (const onboarding of onboardings.filter((candidate) => candidate.phase !== "completed").slice(-6)) {
    const organization = organizations[onboarding.organizationIndex];
    const dueMs = END + rng.int(2, 12) * DAY;
    addTask({
      name: `Collect import data from ${organization.name}`,
      team: "customerSuccess",
      status: statusFor(dueMs),
      priority: "medium",
      assigneeKey: onboarding.ownerKey,
      dueMs,
      createdAtMs: workTime(rng, onboarding.createdAtMs + DAY),
      organizationIndexes: [organization.index],
      dealIndexes: [onboarding.dealIndex],
    });
  }
  for (const ticket of tickets
    .filter((candidate) => candidate.resolvedMs === null || candidate.resolvedMs > candidate.slaDueMs + DAY)
    .slice(-12)) {
    const contact = contacts[ticket.contactIndex];
    const dueMs = Math.min(END + 2 * DAY, ticket.slaDueMs + DAY);
    addTask({
      name: `Update the customer on: ${ticket.name}`,
      team: "support",
      status: ticket.resolvedMs === null ? statusFor(dueMs) : "done",
      priority: ticket.priority === "urgent" || ticket.priority === "high" ? "high" : "medium",
      assigneeKey: ticket.assigneeKey,
      dueMs,
      createdAtMs: workTime(rng, ticket.openedMs + HOUR),
      contactIndexes: [contact.index],
      organizationIndexes: [contact.organizationIndex],
    });
  }
  for (const [index, campaign] of campaigns.entries()) {
    const dueMs = campaign.endMs + 7 * DAY;
    addTask({
      name: index % 2 ? `Review leads and pipeline of ${campaign.name}` : `Hand over ${campaign.name} leads to sales`,
      team: "marketing",
      status: statusFor(dueMs),
      priority: "medium",
      assigneeKey: campaign.ownerKey,
      dueMs,
      createdAtMs: workTime(rng, campaign.startMs - 7 * DAY),
    });
  }
  for (const partner of partners) {
    const dueMs = END + rng.int(-20, 25) * DAY;
    addTask({
      name: `Quarterly pipeline review with ${partner.name}`,
      team: "partnerships",
      status: statusFor(dueMs),
      priority: partner.tier === "gold" ? "high" : "low",
      assigneeKey: "sofiaRossi",
      dueMs,
      createdAtMs: workTime(rng, dueMs - 21 * DAY),
    });
  }
  for (const deal of deals
    .filter((candidate) => candidate.partnerIndex !== null && candidate.status === "won")
    .slice(-4)) {
    const partner = partners[deal.partnerIndex as number];
    const dueMs = deal.closeAtMs + 16 * DAY;
    addTask({
      name: `Partner payout to ${partner.name} for ${deal.name}`,
      team: "partnerships",
      status: statusFor(dueMs),
      priority: "medium",
      assigneeKey: "sofiaRossi",
      dueMs,
      createdAtMs: workTime(rng, deal.closeAtMs + DAY),
      dealIndexes: [deal.index],
    });
  }
  for (const role of openRoles) {
    const dueMs = END + rng.int(-5, 15) * DAY;
    addTask({
      name:
        role.status === "filled"
          ? `Create first-day tasks for the new ${role.name}`
          : `Schedule interviews for ${role.name}`,
      team: "hiring",
      status: role.status === "filled" ? "done" : statusFor(dueMs),
      priority: role.status === "open" ? "medium" : "low",
      assigneeKey: "lauraFischer",
      dueMs,
      createdAtMs: workTime(rng, role.createdAtMs + 3 * DAY),
    });
  }
  for (const candidate of candidates.filter((entry) => entry.stage === "offer")) {
    const dueMs = END + rng.int(1, 6) * DAY;
    addTask({
      name: `Send the offer to ${candidate.name}`,
      team: "hiring",
      status: "inProgress",
      priority: "high",
      assigneeKey: "lauraFischer",
      dueMs,
      createdAtMs: workTime(rng, END - 3 * DAY),
    });
  }
  for (const [index, name] of [
    "Board update: quarterly numbers",
    "Review the pricing page with sales",
    "Budget plan for next year's hiring",
    "Investor update: ARR and churn",
    "Approve the discount above 20 percent for the largest open deal",
  ].entries()) {
    const dueMs = END + (index * 9 - 15) * DAY;
    addTask({
      name,
      team: "management",
      status: statusFor(dueMs),
      priority: index === 0 ? "high" : "medium",
      assigneeKey: "maxBergmann",
      dueMs,
      createdAtMs: workTime(rng, dueMs - 14 * DAY),
      serviceIndexes: index === 1 ? [SERVICE.starter, SERVICE.professional, SERVICE.enterprise] : [],
    });
  }
  addTask({
    name: "Clean up duplicate contacts after the trade fair",
    team: "sales",
    status: "open",
    priority: "low",
    assigneeKey: null,
    dueMs: END + 6 * DAY,
    createdAtMs: workTime(rng, END - 2 * DAY),
  });

  // Notes on key records -------------------------------------------------------------------------------------------------
  for (const organization of ranked.slice(0, 12)) {
    const subscription = subscriptions.find((candidate) => candidate.organizationIndex === organization.index);
    organization.notes = [
      `${organization.name} runs ${Math.max(20, Math.round(organization.companySize / 8))} field technicians in ${2 + (organization.index % 5)} regions.`,
      subscription
        ? `On ${PLAN_LABEL[subscription.plan]} with ${subscription.seats} seats; quarterly business reviews with the Head of Service Operations.`
        : "Evaluating Northwind Field against their ERP service module.",
      "Main goal this year: fewer second visits and faster invoicing from completed jobs.",
    ].join("\n");
  }
  for (const deal of [...deals].sort((a, b) => b.totalValue - a.totalValue).slice(0, 12)) {
    const organization = organizations[deal.organizationIndex];
    deal.notes = [
      `Meeting: ${deal.status === "open" ? "proposal review" : "closing call"}, 45 minutes.`,
      `What we learned: ${organization.name} plans ${deal.seats} seats on ${PLAN_LABEL[deal.plan]}; dispatch runs in spreadsheets today.`,
      deal.discountPercent
        ? `Discount: ${deal.discountPercent} percent on seats${deal.discountPercent > 20 ? ", approved by the CEO" : deal.discountPercent > 10 ? ", approved by the Head of Sales" : ""}.`
        : "List pricing accepted; procurement asked for the ISO 27001 certificate.",
      deal.status === "open"
        ? "Agreed next steps: final presentation to the operations board."
        : `Outcome: ${deal.status}.`,
    ].join("\n");
  }

  // Nothing happened after the story end.
  const past = (ms: number) => Math.min(ms, END - HOUR);
  for (const rows of [organizations, contacts, deals, subscriptions, onboardings, partners, openRoles, tasks] as const)
    for (const row of rows) row.createdAtMs = past(row.createdAtMs);
  for (const ticket of tickets) {
    ticket.openedMs = past(ticket.openedMs);
    ticket.lastResponseMs = past(Math.max(ticket.openedMs, ticket.lastResponseMs));
  }
  for (const candidate of candidates) candidate.appliedMs = past(candidate.appliedMs);

  return {
    organizations,
    contacts,
    services: NORTHWIND_SERVICES,
    deals,
    lineItems,
    subscriptions,
    onboardings,
    tickets,
    campaigns,
    partners,
    openRoles,
    candidates,
    tasks,
  };
}

let cached: NorthwindDataset | undefined;

/** The dataset of this process (built once). */
export function northwindDataset(): NorthwindDataset {
  cached ??= buildNorthwindDataset();
  return cached;
}

/** A plain Formatted text document with one paragraph per line. */
export function northwindDocument(lines: readonly string[] | string): string {
  const paragraphs = typeof lines === "string" ? lines.split("\n") : lines;
  return JSON.stringify({
    type: "doc",
    content: paragraphs.map((text) => ({ type: "paragraph", content: [{ type: "text", text }] })),
  });
}
