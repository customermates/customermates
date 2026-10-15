import type { PrismaClient } from "@/generated/prisma";

import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { Prisma } from "@/generated/prisma";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";

import { fixtureId } from "./helpers";
import { northwindColumns } from "./northwind-columns";
import { northwindModelIds } from "./northwind-model";
import { syntheticRecordKeys } from "./record-keys";

export const SYNTHETIC_P13N_ID_PREFIX = "1f000000";
export const SYNTHETIC_P13N_IDS = {
  contacts: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 1),
  users: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 2),
  tasks: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 3),
  roles: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 4),
  webhooks: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 5),
  deals: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 6),
  services: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 7),
  webhookDeliveries: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 9),
  organizations: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 10),
  contactDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 11),
  organizationDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 12),
  dealDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 13),
  serviceDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 14),
  taskDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 15),
  routines: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 16),
  dashboard: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 19),
  subscriptions: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 20),
  onboardings: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 21),
  tickets: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 22),
  campaigns: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 23),
  partners: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 24),
  openRoles: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 25),
  candidates: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 26),
  subscriptionDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 27),
  onboardingDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 28),
  ticketDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 29),
  campaignDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 30),
  partnerDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 31),
  openRoleDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 32),
  candidateDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 33),
} as const;

export const SYNTHETIC_TEAM_ROUTINE_P13N_IDS = {
  sofiaRossi: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 17),
  elenaHoffmann: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 18),
} as const;

export type SyntheticP13nFixture = Prisma.P13nCreateManyInput & { id: string };

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * The demo user's personalization: the "All" view of every list and the pinned fields of every record page. Like
 * the saved views, each is curated for an overview: a card shows three to five chips, a table the name plus four to
 * six columns, and a record page pins three to five facts. Every other field stays available but hidden.
 */
export function buildSyntheticP13nFixtures(
  context: Pick<SeedContext, "ids">,
  customFields: CustomFieldSeedData,
): SyntheticP13nFixture[] {
  const { customFieldIds } = customFields;
  const { company, user } = context.ids;
  const { id, surface, relationship, path } = syntheticRecordKeys(company);
  const { fields: f } = northwindModelIds(company);
  const dealStage = f.deal.stage;
  const columns = northwindColumns(company, customFieldIds);
  const rel = relationship;
  const listStateKeys = (grouping: boolean) => [
    "filters",
    "sortDescriptor",
    "pageSize",
    "viewMode",
    ...(grouping ? ["grouping"] : []),
    "columnOrder",
    "columnWidths",
    "hiddenColumns",
  ];

  const fixture = (
    fixtureId: string,
    p13nId: string,
    data: Omit<SyntheticP13nFixture, "id" | "companyId" | "p13nId" | "userId">,
  ): SyntheticP13nFixture => ({
    id: fixtureId,
    companyId: company,
    p13nId,
    userId: user,
    ...data,
  });

  const detailFixture = (
    fixtureId: string,
    type: string,
    columnOrder: string[],
    starredFieldIds: string[],
    fieldOrder: string[],
    hiddenFieldIds: string[],
  ): SyntheticP13nFixture =>
    fixture(fixtureId, `record-detail:${id(type)}`, {
      columnOrder,
      hiddenColumns: [],
      viewMode: null,
      detailOptions: inputJson({
        starredFieldIds,
        collapsedSectionIds: [],
        hiddenFieldIds: [...hiddenFieldIds, "system:createdAt", "system:updatedAt"],
        fieldOrder: [...fieldOrder, "system:assignedTo", "system:createdAt", "system:updatedAt"],
      }),
    });

  type ListKey = Parameters<typeof columns.showOnly>[0];
  /** Shows `visible` in that order (plus the name) and hides every other column of the list. */
  const curated = (type: ListKey, visible: string[]) => ({
    columnOrder: visible,
    hiddenColumns: columns.showOnly(type, visible),
  });
  /** The curated "All" table of a custom list, sorted by `sortField`. */
  const customListFixture = (
    fixtureId: string,
    type: ListKey,
    visible: string[],
    sortField: string,
    direction: "asc" | "desc",
  ): SyntheticP13nFixture =>
    fixture(fixtureId, surface(type), {
      ...curated(type, visible),
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction, field: sortField }),
      pagination: inputJson({ pageSize: 100 }),
      viewMode: "table",
      groupingColumnId: null,
      grouping: Prisma.DbNull,
      viewStateKeys: inputJson(listStateKeys(false)),
    });
  /** The record page of a custom list: pins `starredFieldIds` and keeps the default field order. */
  const pinsFixture = (fixtureId: string, type: string, starredFieldIds: string[]): SyntheticP13nFixture =>
    fixture(fixtureId, `record-detail:${id(type)}`, {
      columnOrder: [],
      hiddenColumns: [],
      viewMode: null,
      detailOptions: inputJson({
        starredFieldIds,
        collapsedSectionIds: [],
        hiddenFieldIds: [],
      }),
    });

  return [
    fixture(SYNTHETIC_P13N_IDS.contacts, surface("contact"), {
      ...curated("contact", [
        f.contact.jobTitle,
        rel("contact.organizations", "outgoing"),
        customFieldIds.contactSalesPipeline,
        id("capability.identity"),
      ]),
      columnWidths: inputJson({ [f.contact.jobTitle]: 220 }),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({
        direction: "asc",
        field: id("contact.name"),
      }),
      pagination: inputJson({ pageSize: 100 }),
      viewMode: "table",
      groupingColumnId: null,
      grouping: Prisma.DbNull,
      viewStateKeys: inputJson(listStateKeys(false)),
    }),
    fixture(SYNTHETIC_P13N_IDS.users, SURFACE.users, {
      columnOrder: [],
      columnWidths: inputJson({ role: 108 }),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "name" }),
      pagination: inputJson({ pageSize: 100 }),
      hiddenColumns: ["email"],
      viewMode: "table",
      groupingColumnId: null,
      grouping: Prisma.DbNull,
    }),
    fixture(SYNTHETIC_P13N_IDS.tasks, surface("task"), {
      ...curated("task", [f.task.dueDate, customFieldIds.taskPriority, rel("task.deals", "outgoing")]),
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({
        direction: "desc",
        field: "system:updatedAt",
      }),
      pagination: inputJson({ pageSize: 100 }),
      viewMode: "card",
      groupingColumnId: customFieldIds.taskStatus,
      grouping: inputJson({ field: customFieldIds.taskStatus }),
      viewStateKeys: inputJson(listStateKeys(true)),
    }),
    fixture(SYNTHETIC_P13N_IDS.roles, SURFACE.roles, {
      columnOrder: [],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "asc", field: "type" }),
      pagination: inputJson({ pageSize: 100 }),
      hiddenColumns: [],
      viewMode: null,
      groupingColumnId: null,
      grouping: Prisma.DbNull,
    }),
    fixture(SYNTHETIC_P13N_IDS.webhooks, SURFACE.webhooks, {
      columnOrder: [],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "name" }),
      pagination: inputJson({ pageSize: 100 }),
      hiddenColumns: [],
      viewMode: "table",
      groupingColumnId: null,
      grouping: Prisma.DbNull,
    }),
    fixture(SYNTHETIC_P13N_IDS.deals, surface("deal"), {
      ...curated("deal", [
        id("deal.totalValue"),
        rel("deal.organizations", "outgoing"),
        "system:assignedTo",
        f.deal.openedOn,
      ]),
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: id("deal.name") }),
      pagination: inputJson({ pageSize: 100 }),
      viewMode: "card",
      groupingColumnId: dealStage,
      grouping: inputJson({
        field: dealStage,
        summaries: [{ fieldId: id("deal.totalValue"), aggregation: "sum" }],
      }),
      viewStateKeys: inputJson(listStateKeys(true)),
    }),
    fixture(SYNTHETIC_P13N_IDS.services, surface("service"), {
      ...curated("service", [
        customFieldIds.serviceType,
        id("service.amount"),
        customFieldIds.servicePricing,
        path("service.deals.path"),
      ]),
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({
        direction: "asc",
        field: id("service.name"),
      }),
      pagination: inputJson({ pageSize: 100 }),
      viewMode: "table",
      groupingColumnId: null,
      grouping: Prisma.DbNull,
      viewStateKeys: inputJson(listStateKeys(false)),
    }),
    fixture(SYNTHETIC_P13N_IDS.webhookDeliveries, SURFACE.webhookDeliveries, {
      columnOrder: [],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "createdAt" }),
      pagination: inputJson({ pageSize: 25 }),
      hiddenColumns: [],
      viewMode: null,
      groupingColumnId: null,
      grouping: Prisma.DbNull,
    }),
    fixture(SYNTHETIC_P13N_IDS.organizations, surface("organization"), {
      ...curated("organization", [
        customFieldIds.organizationType,
        f.organization.industry,
        f.organization.segment,
        f.organization.arr,
        "system:assignedTo",
      ]),
      columnWidths: inputJson({ [id("organization.name")]: 260 }),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({
        direction: "asc",
        field: id("organization.name"),
      }),
      pagination: inputJson({ pageSize: 100 }),
      viewMode: "table",
      groupingColumnId: null,
      grouping: Prisma.DbNull,
      viewStateKeys: inputJson(listStateKeys(false)),
    }),
    fixture(SYNTHETIC_P13N_IDS.dashboard, SURFACE.dashboard, {
      columnOrder: [],
      hiddenColumns: [],
      viewMode: null,
      activeViewKey: ALL_VIEW_KEY,
    }),
    fixture(SYNTHETIC_P13N_IDS.routines, SURFACE.routines, {
      columnOrder: [],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "createdAt" }),
      pagination: inputJson({ pageSize: 100 }),
      hiddenColumns: [],
      viewMode: "table",
      groupingColumnId: "ownerUserId",
      grouping: inputJson({ field: "ownerUserId" }),
    }),
    customListFixture(
      SYNTHETIC_P13N_IDS.subscriptions,
      "subscription",
      [
        rel("subscription.organization", "outgoing"),
        f.subscription.plan,
        f.subscription.arr,
        f.subscription.renewalDate,
        f.subscription.health,
      ],
      f.subscription.renewalDate,
      "asc",
    ),
    customListFixture(
      SYNTHETIC_P13N_IDS.onboardings,
      "onboarding",
      [rel("onboarding.organization", "outgoing"), f.onboarding.phase, f.onboarding.owner, f.onboarding.progress],
      f.onboarding.progress,
      "asc",
    ),
    customListFixture(
      SYNTHETIC_P13N_IDS.tickets,
      "ticket",
      [f.ticket.priority, f.ticket.status, f.ticket.assignee, f.ticket.slaDue],
      f.ticket.slaDue,
      "asc",
    ),
    customListFixture(
      SYNTHETIC_P13N_IDS.campaigns,
      "campaign",
      [f.campaign.channel, f.campaign.period, f.campaign.budget, f.campaign.pipelineSourced],
      f.campaign.pipelineSourced,
      "desc",
    ),
    customListFixture(
      SYNTHETIC_P13N_IDS.partners,
      "partner",
      [f.partner.tier, f.partner.region, f.partner.referredPipeline, f.partner.revenueInfluenced],
      f.partner.revenueInfluenced,
      "desc",
    ),
    customListFixture(
      SYNTHETIC_P13N_IDS.openRoles,
      "openRole",
      [f.openRole.department, f.openRole.status, f.openRole.hiringManager, f.openRole.targetStart],
      f.openRole.targetStart,
      "asc",
    ),
    customListFixture(
      SYNTHETIC_P13N_IDS.candidates,
      "candidate",
      [rel("candidate.openRole", "outgoing"), f.candidate.stage, f.candidate.source, f.candidate.appliedOn],
      f.candidate.appliedOn,
      "desc",
    ),
    detailFixture(
      SYNTHETIC_P13N_IDS.contactDetail,
      "contact",
      [customFieldIds.contactSalesPipeline, id("capability.identity")],
      [
        f.contact.jobTitle,
        relationship("contact.organizations", "outgoing"),
        customFieldIds.contactSalesPipeline,
        id("capability.identity"),
      ],
      [
        id("contact.firstName"),
        id("contact.lastName"),
        f.contact.jobTitle,
        customFieldIds.contactSalesPipeline,
        relationship("contact.organizations", "outgoing"),
        id("capability.identity"),
        relationship("deal.contacts", "incoming"),
        relationship("task.contacts", "incoming"),
      ],
      [relationship("task.contacts", "incoming")],
    ),
    detailFixture(
      SYNTHETIC_P13N_IDS.organizationDetail,
      "organization",
      [customFieldIds.organizationType, customFieldIds.organizationWebsite],
      [customFieldIds.organizationType, f.organization.industry, f.organization.arr, "system:assignedTo"],
      [
        id("organization.name"),
        customFieldIds.organizationType,
        f.organization.industry,
        f.organization.arr,
        customFieldIds.organizationWebsite,
        relationship("contact.organizations", "incoming"),
        relationship("deal.organizations", "incoming"),
        relationship("task.organizations", "incoming"),
      ],
      [relationship("task.organizations", "incoming")],
    ),
    detailFixture(
      SYNTHETIC_P13N_IDS.dealDetail,
      "deal",
      [customFieldIds.dealStatus, customFieldIds.dealProjectPeriod],
      [
        id("deal.totalValue"),
        dealStage,
        f.deal.openedOn,
        relationship("deal.organizations", "outgoing"),
        "system:assignedTo",
      ],
      [
        id("deal.name"),
        dealStage,
        f.deal.openedOn,
        customFieldIds.dealStatus,
        relationship("deal.organizations", "outgoing"),
        customFieldIds.dealProjectPeriod,
        path("deal.services.path"),
        id("deal.totalQuantity"),
        id("deal.totalValue"),
        id("deal.weightedValue"),
        relationship("deal.contacts", "outgoing"),
        relationship("task.deals", "incoming"),
      ],
      [id("deal.weightedValue"), relationship("deal.contacts", "outgoing"), relationship("task.deals", "incoming")],
    ),
    detailFixture(
      SYNTHETIC_P13N_IDS.serviceDetail,
      "service",
      [customFieldIds.serviceType, customFieldIds.servicePricing],
      [id("service.amount"), customFieldIds.serviceType, customFieldIds.servicePricing],
      [
        id("service.name"),
        customFieldIds.serviceType,
        customFieldIds.servicePricing,
        id("service.amount"),
        path("service.deals.path"),
        relationship("task.services", "incoming"),
      ],
      [relationship("task.services", "incoming")],
    ),
    detailFixture(
      SYNTHETIC_P13N_IDS.taskDetail,
      "task",
      [customFieldIds.taskPriority, customFieldIds.taskStatus],
      [customFieldIds.taskStatus, customFieldIds.taskPriority, f.task.dueDate, "system:assignedTo"],
      [
        id("task.name"),
        customFieldIds.taskStatus,
        customFieldIds.taskPriority,
        f.task.dueDate,
        relationship("task.contacts", "outgoing"),
        relationship("task.organizations", "outgoing"),
        relationship("task.deals", "outgoing"),
        relationship("task.services", "outgoing"),
      ],
      [relationship("task.organizations", "outgoing"), relationship("task.services", "outgoing")],
    ),
    pinsFixture(SYNTHETIC_P13N_IDS.subscriptionDetail, "subscription", [
      rel("subscription.organization", "outgoing"),
      f.subscription.plan,
      f.subscription.arr,
      f.subscription.renewalDate,
      f.subscription.health,
    ]),
    pinsFixture(SYNTHETIC_P13N_IDS.onboardingDetail, "onboarding", [
      rel("onboarding.organization", "outgoing"),
      f.onboarding.phase,
      f.onboarding.owner,
      f.onboarding.progress,
    ]),
    pinsFixture(SYNTHETIC_P13N_IDS.ticketDetail, "ticket", [
      f.ticket.priority,
      f.ticket.status,
      f.ticket.assignee,
      f.ticket.slaDue,
    ]),
    pinsFixture(SYNTHETIC_P13N_IDS.campaignDetail, "campaign", [
      f.campaign.channel,
      f.campaign.owner,
      f.campaign.budget,
      f.campaign.pipelineSourced,
    ]),
    pinsFixture(SYNTHETIC_P13N_IDS.partnerDetail, "partner", [
      f.partner.tier,
      f.partner.region,
      f.partner.revenueInfluenced,
    ]),
    pinsFixture(SYNTHETIC_P13N_IDS.openRoleDetail, "openRole", [
      f.openRole.department,
      f.openRole.status,
      f.openRole.hiringManager,
      f.openRole.targetStart,
    ]),
    pinsFixture(SYNTHETIC_P13N_IDS.candidateDetail, "candidate", [
      rel("candidate.openRole", "outgoing"),
      f.candidate.stage,
      f.candidate.source,
      f.candidate.appliedOn,
    ]),
  ];
}

export async function persistSyntheticP13nFixtures(
  prisma: Pick<PrismaClient, "p13n">,
  companyId: string,
  userId: string,
  fixtures: SyntheticP13nFixture[],
): Promise<void> {
  for (const entry of fixtures) {
    const { id, ...data } = entry;
    await prisma.p13n.upsert({
      where: {
        companyId_userId_p13nId: { companyId, userId, p13nId: entry.p13nId },
      },
      update: data,
      create: { id, ...data },
    });
  }

  await prisma.p13n.deleteMany({
    where: {
      companyId,
      userId,
      id: {
        startsWith: `${SYNTHETIC_P13N_ID_PREFIX}-`,
        notIn: fixtures.map(({ id }) => id),
      },
    },
  });
}

export async function seedPersonalization(context: SeedContext, customFields: CustomFieldSeedData): Promise<void> {
  const fixtures = buildSyntheticP13nFixtures(context, customFields);
  await persistSyntheticP13nFixtures(context.prisma, context.ids.company, context.ids.user, fixtures);

  const routineTemplate = fixtures.find(({ p13nId }) => p13nId === SURFACE.routines);
  if (!routineTemplate) throw new Error("The synthetic Routine personalization fixture is missing.");

  for (const [id, userId] of [
    [SYNTHETIC_TEAM_ROUTINE_P13N_IDS.sofiaRossi, context.ids.sofiaRossiUser],
    [SYNTHETIC_TEAM_ROUTINE_P13N_IDS.elenaHoffmann, context.ids.elenaHoffmannUser],
  ] as const) {
    await persistSyntheticP13nFixtures(context.prisma, context.ids.company, userId, [
      { ...routineTemplate, id, userId },
    ]);
  }
}
