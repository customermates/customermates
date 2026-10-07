import type { PrismaClient } from "@/generated/prisma";

import { SURFACE } from "@/core/data-view/data-view-keys";
import { Prisma } from "@/generated/prisma";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";

import { fixtureId } from "./helpers";
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
} as const;

export const SYNTHETIC_TEAM_ROUTINE_P13N_IDS = {
  sofiaRossi: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 17),
  elenaHoffmann: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 18),
} as const;

export type SyntheticP13nFixture = Prisma.P13nCreateManyInput & { id: string };

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function buildSyntheticP13nFixtures(
  context: Pick<SeedContext, "ids">,
  customFields: CustomFieldSeedData,
): SyntheticP13nFixture[] {
  const { customFieldIds } = customFields;
  const { company, user } = context.ids;
  const { id, surface, relationship, path } = syntheticRecordKeys(company);
  const assignedToMe = { field: "system:assignedTo", operator: "in", value: [user] } as const;
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

  return [
    fixture(SYNTHETIC_P13N_IDS.contacts, surface("contact"), {
      columnOrder: [
        relationship("contact.organizations", "outgoing"),
        relationship("task.contacts", "incoming"),
        relationship("deal.contacts", "incoming"),
        customFieldIds.contactSalesPipeline,
        customFieldIds.contactPhone,
        "system:channels",
        "system:updatedAt",
        "system:createdAt",
        "system:assignedTo",
      ],
      columnWidths: inputJson({ [relationship("task.contacts", "incoming")]: 133 }),
      filters: inputJson([assignedToMe]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "asc", field: id("contact.name") }),
      pagination: inputJson({ pageSize: 100 }),
      hiddenColumns: [
        relationship("deal.contacts", "incoming"),
        "system:createdAt",
        id("contact.firstName"),
        id("contact.lastName"),
        id("contact.avatarUrl"),
      ],
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
      columnOrder: [
        customFieldIds.taskPriority,
        customFieldIds.taskStatus,
        "system:updatedAt",
        "system:createdAt",
        "system:assignedTo",
      ],
      columnWidths: inputJson({}),
      filters: inputJson([assignedToMe]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "system:updatedAt" }),
      pagination: inputJson({ pageSize: 100 }),
      hiddenColumns: [
        customFieldIds.taskStatus,
        "system:createdAt",
        relationship("task.contacts", "outgoing"),
        relationship("task.organizations", "outgoing"),
        relationship("task.deals", "outgoing"),
        relationship("task.services", "outgoing"),
        "system:assignedTo",
        "system:updatedAt",
      ],
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
      columnOrder: [
        customFieldIds.dealStatus,
        id("deal.totalValue"),
        id("deal.weightedValue"),
        relationship("task.deals", "incoming"),
        id("deal.totalQuantity"),
        customFieldIds.dealProjectPeriod,
        relationship("deal.contacts", "outgoing"),
        relationship("deal.organizations", "outgoing"),
        path("deal.services.path"),
        "system:assignedTo",
        "system:updatedAt",
        "system:createdAt",
      ],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: id("deal.name") }),
      pagination: inputJson({ pageSize: 100 }),
      hiddenColumns: [
        relationship("deal.contacts", "outgoing"),
        "system:updatedAt",
        "system:createdAt",
        relationship("task.deals", "incoming"),
        relationship("lineItem.deal", "incoming"),
      ],
      viewMode: "card",
      groupingColumnId: customFieldIds.dealStatus,
      grouping: inputJson({ field: customFieldIds.dealStatus }),
      viewStateKeys: inputJson(listStateKeys(true)),
    }),
    fixture(SYNTHETIC_P13N_IDS.services, surface("service"), {
      columnOrder: [
        customFieldIds.serviceType,
        id("service.amount"),
        customFieldIds.servicePricing,
        path("service.deals.path"),
        relationship("task.services", "incoming"),
        "system:updatedAt",
        "system:createdAt",
        "system:assignedTo",
      ],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "asc", field: id("service.name") }),
      pagination: inputJson({ pageSize: 100 }),
      hiddenColumns: [
        "system:createdAt",
        relationship("task.services", "incoming"),
        relationship("lineItem.service", "incoming"),
      ],
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
      columnOrder: [
        relationship("contact.organizations", "incoming"),
        relationship("deal.organizations", "incoming"),
        relationship("task.organizations", "incoming"),
        customFieldIds.organizationType,
        customFieldIds.organizationWebsite,
        "system:updatedAt",
        "system:createdAt",
        "system:assignedTo",
      ],
      columnWidths: inputJson({
        [relationship("deal.organizations", "incoming")]: 227,
        [relationship("task.organizations", "incoming")]: 191,
      }),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "asc", field: id("organization.name") }),
      pagination: inputJson({ pageSize: 100 }),
      hiddenColumns: ["system:createdAt"],
      viewMode: "table",
      groupingColumnId: null,
      grouping: Prisma.DbNull,
      viewStateKeys: inputJson(listStateKeys(false)),
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
    detailFixture(
      SYNTHETIC_P13N_IDS.contactDetail,
      "contact",
      [customFieldIds.contactSalesPipeline, customFieldIds.contactPhone],
      ["system:channels", relationship("contact.organizations", "outgoing"), customFieldIds.contactSalesPipeline],
      [
        id("contact.firstName"),
        id("contact.lastName"),
        customFieldIds.contactSalesPipeline,
        relationship("contact.organizations", "outgoing"),
        "system:channels",
        customFieldIds.contactPhone,
        relationship("deal.contacts", "incoming"),
        relationship("task.contacts", "incoming"),
      ],
      [relationship("task.contacts", "incoming")],
    ),
    detailFixture(
      SYNTHETIC_P13N_IDS.organizationDetail,
      "organization",
      [customFieldIds.organizationType, customFieldIds.organizationWebsite],
      [customFieldIds.organizationType, customFieldIds.organizationWebsite, "system:assignedTo"],
      [
        id("organization.name"),
        customFieldIds.organizationType,
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
        id("deal.totalQuantity"),
        relationship("deal.organizations", "outgoing"),
        customFieldIds.dealStatus,
      ],
      [
        id("deal.name"),
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
      [customFieldIds.taskStatus, customFieldIds.taskPriority, "system:assignedTo"],
      [
        id("task.name"),
        customFieldIds.taskStatus,
        customFieldIds.taskPriority,
        relationship("task.contacts", "outgoing"),
        relationship("task.organizations", "outgoing"),
        relationship("task.deals", "outgoing"),
        relationship("task.services", "outgoing"),
      ],
      [relationship("task.organizations", "outgoing"), relationship("task.services", "outgoing")],
    ),
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
