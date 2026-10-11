import { presetId } from "@/features/records/crm-preset";

import { SEED_IDS } from "./context";
import { fixtureId } from "./helpers";

/**
 * The Northwind Labs demo workspace model: stable ids for every list, field, option, relationship, member and
 * role the synthetic seed creates. Northwind Labs is a fictional 40-person B2B software company in Berlin selling
 * Northwind Field, a field-service planning app, on annual per-seat subscriptions plus one-time onboarding and
 * integration services, with a small partner channel.
 *
 * Starter lists (contacts, organizations, deals with line items, services, tasks) keep their preset ids, and the
 * custom fields the seed added before keep their `16000000-` ids. Everything new derives from `presetId`, so
 * the ids are deterministic per workspace and stable across seed runs. Saved views, dashboards and personal
 * settings build on the constants below; `NORTHWIND_MODEL_IDS` holds the ids of the seeded demo workspace.
 */

export const NORTHWIND_COMPANY_NAME = "Northwind Labs";
export const NORTHWIND_PRODUCT_NAME = "Northwind Field";

/** Starter list keys (preset) and the custom list keys the demo adds, as `presetId` keys. */
export const NORTHWIND_STARTER_TYPE_KEYS = [
  "contact",
  "organization",
  "deal",
  "lineItem",
  "service",
  "task",
] as const;
export const NORTHWIND_CUSTOM_TYPE_KEYS = [
  "subscription",
  "onboarding",
  "ticket",
  "campaign",
  "partner",
  "openRole",
  "candidate",
] as const;
export type NorthwindTypeKey =
  | (typeof NORTHWIND_STARTER_TYPE_KEYS)[number]
  | (typeof NORTHWIND_CUSTOM_TYPE_KEYS)[number];

/** Option keys per choice field, in board order. The option id is `presetId(companyId, "<fieldKey>.<optionKey>")`. */
export const NORTHWIND_OPTION_KEYS = {
  "organization.industry": [
    "facilityManagement",
    "hvac",
    "elevators",
    "utilities",
    "logistics",
    "medicalDevices",
    "solar",
    "propertyManagement",
    "securitySystems",
    "waterTreatment",
  ],
  "organization.segment": ["smb", "midMarket", "enterprise"],
  "contact.dealRole": [
    "decisionMaker",
    "champion",
    "influencer",
    "user",
    "procurement",
  ],
  "deal.stage": [
    "new",
    "qualified",
    "demo",
    "proposal",
    "negotiation",
    "won",
    "lost",
  ],
  "task.team": [
    "sales",
    "customerSuccess",
    "support",
    "marketing",
    "partnerships",
    "hiring",
    "management",
  ],
  "subscription.plan": ["starter", "professional", "enterprise"],
  "subscription.billing": ["perSeat", "annualPrice"],
  "subscription.health": ["healthy", "watch", "atRisk"],
  "onboarding.phase": [
    "kickoff",
    "configuration",
    "dataMigration",
    "training",
    "goLive",
    "hypercare",
    "completed",
  ],
  "ticket.priority": ["low", "normal", "high", "urgent"],
  "ticket.status": ["new", "open", "waitingOnCustomer", "resolved", "closed"],
  "ticket.category": [
    "routing",
    "mobileApp",
    "integrations",
    "dataImport",
    "billing",
    "access",
  ],
  "campaign.channel": [
    "webinar",
    "tradeFair",
    "linkedinAds",
    "googleAds",
    "email",
    "partnerEvent",
  ],
  "partner.tier": ["gold", "silver", "registered"],
  "partner.region": ["dach", "benelux", "nordics", "ukIreland"],
  "openRole.department": [
    "engineering",
    "sales",
    "customerSuccess",
    "support",
    "marketing",
    "operations",
  ],
  "openRole.status": ["open", "onHold", "filled"],
  "candidate.stage": [
    "applied",
    "screening",
    "interview",
    "offer",
    "hired",
    "rejected",
  ],
  "candidate.source": ["linkedin", "referral", "careersPage", "agency"],
} as const;
export type NorthwindChoiceFieldKey = keyof typeof NORTHWIND_OPTION_KEYS;

/** Every field the demo adds, as `presetId` keys, grouped by list. Starter fields keep their preset keys. */
export const NORTHWIND_FIELD_KEYS = {
  organization: {
    industry: "organization.industry",
    companySize: "organization.companySize",
    segment: "organization.segment",
    channels: "organization.channels",
    arr: "organization.arr",
    licensedSeats: "organization.licensedSeats",
    openPipeline: "organization.openPipeline",
    legacyAccountId: "organization.legacyAccountId",
  },
  contact: {
    jobTitle: "contact.jobTitle",
    dealRole: "contact.dealRole",
  },
  deal: {
    stage: "deal.stage",
    openedOn: "deal.openedOn",
    closeDate: "deal.closeDate",
    contractValue: "deal.contractValue",
    listValue: "deal.listValue",
    discountPercent: "deal.discountPercent",
    daysToClose: "deal.daysToClose",
    openValue: "deal.openValue",
    industry: "deal.industry",
  },
  lineItem: {
    listAmount: "lineItem.listAmount",
  },
  task: {
    team: "task.team",
    dueDate: "task.dueDate",
  },
  subscription: {
    name: "subscription.name",
    notes: "subscription.notes",
    plan: "subscription.plan",
    billing: "subscription.billing",
    seats: "subscription.seats",
    pricePerSeat: "subscription.pricePerSeat",
    annualPrice: "subscription.annualPrice",
    arr: "subscription.arr",
    startDate: "subscription.startDate",
    renewalDate: "subscription.renewalDate",
    health: "subscription.health",
    industry: "subscription.industry",
  },
  onboarding: {
    name: "onboarding.name",
    notes: "onboarding.notes",
    phase: "onboarding.phase",
    owner: "onboarding.owner",
    timeline: "onboarding.timeline",
    progress: "onboarding.progress",
  },
  ticket: {
    name: "ticket.name",
    notes: "ticket.notes",
    priority: "ticket.priority",
    status: "ticket.status",
    category: "ticket.category",
    assignee: "ticket.assignee",
    openedOn: "ticket.openedOn",
    slaDue: "ticket.slaDue",
    lastResponseOn: "ticket.lastResponseOn",
    resolvedOn: "ticket.resolvedOn",
    daysOverSla: "ticket.daysOverSla",
    overdue: "ticket.overdue",
  },
  campaign: {
    name: "campaign.name",
    notes: "campaign.notes",
    channel: "campaign.channel",
    budget: "campaign.budget",
    period: "campaign.period",
    dealsSourced: "campaign.dealsSourced",
    pipelineSourced: "campaign.pipelineSourced",
    wonRevenue: "campaign.wonRevenue",
    costPerDeal: "campaign.costPerDeal",
  },
  partner: {
    name: "partner.name",
    notes: "partner.notes",
    tier: "partner.tier",
    region: "partner.region",
    website: "partner.website",
    commissionRate: "partner.commissionRate",
    annualFee: "partner.annualFee",
    referredPipeline: "partner.referredPipeline",
    revenueInfluenced: "partner.revenueInfluenced",
    commissionDue: "partner.commissionDue",
  },
  openRole: {
    name: "openRole.name",
    notes: "openRole.notes",
    department: "openRole.department",
    status: "openRole.status",
    hiringManager: "openRole.hiringManager",
    salaryBudget: "openRole.salaryBudget",
    targetStart: "openRole.targetStart",
    candidateCount: "openRole.candidateCount",
  },
  candidate: {
    name: "candidate.name",
    notes: "candidate.notes",
    stage: "candidate.stage",
    source: "candidate.source",
    email: "candidate.email",
    appliedOn: "candidate.appliedOn",
    salaryExpectation: "candidate.salaryExpectation",
    interviewers: "candidate.interviewers",
    interviewNotes: "candidate.interviewNotes",
    department: "candidate.department",
  },
} as const;

/** Relationships the demo adds, as `presetId` keys (source list first). */
export const NORTHWIND_RELATIONSHIP_KEYS = {
  dealCampaign: "deal.campaign",
  dealPartner: "deal.partner",
  subscriptionOrganization: "subscription.organization",
  subscriptionDeal: "subscription.deal",
  onboardingDeal: "onboarding.deal",
  onboardingOrganization: "onboarding.organization",
  ticketSubscription: "ticket.subscription",
  ticketContact: "ticket.contact",
  candidateOpenRole: "candidate.openRole",
} as const;

/** Relationship paths the demo adds (type id is the list that shows the path). */
export const NORTHWIND_PATH_KEYS = {
  organizationProducts: "organization.products.path",
  organizationTickets: "organization.tickets.path",
} as const;

type Ids<T> = { [K in keyof T]: T[K] extends string ? string : Ids<T[K]> };

function mapIds<T extends Record<string, unknown>>(
  value: T,
  id: (key: string) => string,
): Ids<T> {
  return Object.fromEntries(
    Object.entries(value).map(([name, child]) => [
      name,
      typeof child === "string"
        ? id(child)
        : mapIds(child as Record<string, unknown>, id),
    ]),
  ) as Ids<T>;
}

export function northwindModelIds(companyId: string) {
  const id = (key: string) => presetId(companyId, key);
  const types = Object.fromEntries(
    [...NORTHWIND_STARTER_TYPE_KEYS, ...NORTHWIND_CUSTOM_TYPE_KEYS].map(
      (key) => [key, id(key)],
    ),
  ) as Record<NorthwindTypeKey, string>;
  const options = Object.fromEntries(
    Object.entries(NORTHWIND_OPTION_KEYS).map(([field, keys]) => [
      field,
      Object.fromEntries(keys.map((key) => [key, id(`${field}.${key}`)])),
    ]),
  ) as {
    [F in NorthwindChoiceFieldKey]: Record<
      (typeof NORTHWIND_OPTION_KEYS)[F][number],
      string
    >;
  };
  return {
    types,
    fields: mapIds(NORTHWIND_FIELD_KEYS, id),
    options,
    relationships: mapIds(NORTHWIND_RELATIONSHIP_KEYS, id),
    paths: mapIds(NORTHWIND_PATH_KEYS, id),
    /** Starter relationships and fields the demo builds on, for convenience. */
    starter: {
      contactOrganizations: id("contact.organizations"),
      dealContacts: id("deal.contacts"),
      dealOrganizations: id("deal.organizations"),
      lineItemDeal: id("lineItem.deal"),
      lineItemService: id("lineItem.service"),
      taskContacts: id("task.contacts"),
      taskOrganizations: id("task.organizations"),
      taskDeals: id("task.deals"),
      taskServices: id("task.services"),
      dealServicesPath: id("deal.services.path"),
      serviceDealsPath: id("service.deals.path"),
      contactChannels: id("capability.identity"),
      dealTotalValue: id("deal.totalValue"),
      dealTotalQuantity: id("deal.totalQuantity"),
      dealWeightedValue: id("deal.weightedValue"),
      serviceAmount: id("service.amount"),
      lineItemQuantity: id("lineItem.quantity"),
      lineItemAmount: id("lineItem.amount"),
    },
  };
}

export type NorthwindModelIds = ReturnType<typeof northwindModelIds>;

/** Ids of the seeded demo workspace (`SEED_IDS.company`). */
export const NORTHWIND_MODEL_IDS = northwindModelIds(SEED_IDS.company);

/** Record id prefixes of the custom lists (`fixtureId(prefix, n)`). */
export const NORTHWIND_RECORD_ID_PREFIXES = {
  subscription: "4a100000",
  onboarding: "4a200000",
  ticket: "4a300000",
  campaign: "4a400000",
  partner: "4a500000",
  openRole: "4a600000",
  candidate: "4a700000",
} as const;

/** The seven Northwind Labs members. The first three keep their historical ids and sign-in identities. */
export const NORTHWIND_MEMBER_IDS = {
  maxBergmann: SEED_IDS.user,
  sofiaRossi: SEED_IDS.sofiaRossiUser,
  elenaHoffmann: SEED_IDS.elenaHoffmannUser,
  claraNeumann: fixtureId("30000000", 5),
  marcoSilva: fixtureId("30000000", 6),
  kianRahimi: fixtureId("30000000", 7),
  lauraFischer: fixtureId("30000000", 8),
} as const;

/** Job title of each member (the workspace story; the access is the role below). */
export const NORTHWIND_MEMBER_TITLES = {
  maxBergmann: "Founder and CEO",
  sofiaRossi: "Head of Sales",
  elenaHoffmann: "Customer Success Manager",
  claraNeumann: "Account Executive",
  marcoSilva: "Account Executive",
  kianRahimi: "Support Engineer",
  lauraFischer: "People and Operations",
} as const satisfies Record<keyof typeof NORTHWIND_MEMBER_IDS, string>;

/** Roles: Admin (system), Sales lead, Account executive, Customer success, Support, People and operations. */
export const NORTHWIND_ROLE_IDS = {
  admin: SEED_IDS.role,
  salesLead: SEED_IDS.salesManagerRole,
  customerSuccess: SEED_IDS.customerSuccessRole,
  accountExecutive: fixtureId("20000000", 5),
  support: fixtureId("20000000", 6),
  peopleOperations: fixtureId("20000000", 7),
} as const;

export const NORTHWIND_MEMBER_ROLES = {
  maxBergmann: NORTHWIND_ROLE_IDS.admin,
  sofiaRossi: NORTHWIND_ROLE_IDS.salesLead,
  elenaHoffmann: NORTHWIND_ROLE_IDS.customerSuccess,
  claraNeumann: NORTHWIND_ROLE_IDS.accountExecutive,
  marcoSilva: NORTHWIND_ROLE_IDS.accountExecutive,
  kianRahimi: NORTHWIND_ROLE_IDS.support,
  lauraFischer: NORTHWIND_ROLE_IDS.peopleOperations,
} as const satisfies Record<keyof typeof NORTHWIND_MEMBER_IDS, string>;
