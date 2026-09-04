import type { Prisma, PrismaClient } from "@/generated/prisma";

import {
  CONTACT_DETAIL_FIELD,
  CONTACT_DETAIL_P13N_ID,
} from "@/app/[locale]/(protected)/contacts/components/contact-detail-personalization";
import {
  DEAL_DETAIL_FIELD,
  DEAL_DETAIL_P13N_ID,
} from "@/app/[locale]/(protected)/deals/components/deal-detail-personalization";
import {
  ORGANIZATION_DETAIL_FIELD,
  ORGANIZATION_DETAIL_P13N_ID,
} from "@/app/[locale]/(protected)/organizations/components/organization-detail-personalization";
import {
  SERVICE_DETAIL_FIELD,
  SERVICE_DETAIL_P13N_ID,
} from "@/app/[locale]/(protected)/services/components/service-detail-personalization";
import {
  TASK_DETAIL_FIELD,
  TASK_DETAIL_P13N_ID,
} from "@/app/[locale]/(protected)/tasks/components/task-detail-personalization";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";

import { fixtureId } from "./helpers";

export const SYNTHETIC_P13N_ID_PREFIX = "1f000000";
export const SYNTHETIC_P13N_IDS = {
  contacts: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 1),
  users: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 2),
  tasks: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 3),
  roles: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 4),
  webhooks: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 5),
  deals: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 6),
  services: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 7),
  auditLogs: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 8),
  webhookDeliveries: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 9),
  organizations: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 10),
  contactDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 11),
  organizationDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 12),
  dealDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 13),
  serviceDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 14),
  taskDetail: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 15),
} as const;

export type SyntheticP13nFixture = Prisma.P13nCreateManyInput & { id: string };

function inputJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export function buildSyntheticP13nFixtures(
  context: Pick<SeedContext, "ids">,
  customFields: CustomFieldSeedData,
): SyntheticP13nFixture[] {
  const { customColumnIds } = customFields;
  const { company, user } = context.ids;
  const userFilter = {
    field: "userIds",
    operator: "in",
    value: [user],
  } as const;

  const fixture = (
    id: string,
    p13nId: string,
    data: Omit<SyntheticP13nFixture, "id" | "companyId" | "p13nId" | "userId">,
  ): SyntheticP13nFixture => ({
    id,
    companyId: company,
    p13nId,
    userId: user,
    ...data,
  });

  const detailFixture = (
    id: string,
    p13nId: string,
    columnOrder: string[],
    starredFieldIds: string[],
  ): SyntheticP13nFixture =>
    fixture(id, p13nId, {
      columnOrder,
      hiddenColumns: [],
      viewMode: null,
      detailOptions: inputJson({
        starredFieldIds,
        collapsedSectionIds: [],
      }),
    });

  return [
    fixture(SYNTHETIC_P13N_IDS.contacts, "contacts-card-store", {
      columnOrder: [
        "organizations",
        "tasks",
        "deals",
        customColumnIds.contactSalesPipeline,
        customColumnIds.contactPhone,
        "channels",
        "updatedAt",
        "createdAt",
        "users",
      ],
      columnWidths: inputJson({ tasks: 133 }),
      filters: inputJson([userFilter]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "asc", field: "name" }),
      pagination: inputJson({ page: 1, pageSize: 100 }),
      hiddenColumns: ["deals", "createdAt"],
      viewMode: "table",
      groupingColumnId: null,
    }),
    fixture(SYNTHETIC_P13N_IDS.users, "users-card-store", {
      columnOrder: [],
      columnWidths: inputJson({ role: 108 }),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "name" }),
      pagination: inputJson({ page: 1, pageSize: 100 }),
      hiddenColumns: ["email"],
      viewMode: "table",
      groupingColumnId: null,
    }),
    fixture(SYNTHETIC_P13N_IDS.tasks, "tasks-card-store", {
      columnOrder: [customColumnIds.taskPriority, customColumnIds.taskStatus, "updatedAt", "createdAt", "users"],
      columnWidths: inputJson({}),
      filters: inputJson([userFilter]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "updatedAt" }),
      pagination: inputJson({ page: 1, pageSize: 100 }),
      hiddenColumns: [
        customColumnIds.taskStatus,
        "createdAt",
        "contacts",
        "organizations",
        "deals",
        "services",
        "users",
        "updatedAt",
      ],
      viewMode: "card",
      groupingColumnId: customColumnIds.taskStatus,
    }),
    fixture(SYNTHETIC_P13N_IDS.roles, "roles-card-store", {
      columnOrder: [],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "asc", field: "type" }),
      pagination: inputJson({ page: 1, pageSize: 100 }),
      hiddenColumns: [],
      viewMode: null,
      groupingColumnId: null,
    }),
    fixture(SYNTHETIC_P13N_IDS.webhooks, "webhooks-card-store", {
      columnOrder: [],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "name" }),
      pagination: inputJson({ page: 1, pageSize: 100 }),
      hiddenColumns: [],
      viewMode: "card",
      groupingColumnId: null,
    }),
    fixture(SYNTHETIC_P13N_IDS.deals, "deals-card-store", {
      columnOrder: [
        customColumnIds.dealStatus,
        "totalValue",
        "weightedValue",
        "tasks",
        "totalQuantity",
        customColumnIds.dealProjectPeriod,
        "contacts",
        "organizations",
        "services",
        "users",
        "updatedAt",
        "createdAt",
      ],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "name" }),
      pagination: inputJson({ page: 1, pageSize: 100 }),
      hiddenColumns: ["contacts", "updatedAt", "createdAt", "tasks"],
      viewMode: "card",
      groupingColumnId: customColumnIds.dealStatus,
    }),
    fixture(SYNTHETIC_P13N_IDS.services, "services-card-store", {
      columnOrder: [
        customColumnIds.serviceType,
        "amount",
        customColumnIds.servicePricing,
        "deals",
        "tasks",
        "updatedAt",
        "createdAt",
        "users",
      ],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "asc", field: "name" }),
      pagination: inputJson({ page: 1, pageSize: 100 }),
      hiddenColumns: ["createdAt", "tasks"],
      viewMode: "table",
      groupingColumnId: null,
    }),
    fixture(SYNTHETIC_P13N_IDS.auditLogs, "audit-logs-card-store", {
      columnOrder: ["event", "entityId", "createdAt", "user"],
      columnWidths: inputJson({ name: 302 }),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "createdAt" }),
      pagination: inputJson({ page: 1, pageSize: 25 }),
      hiddenColumns: ["entityId"],
      viewMode: "table",
      groupingColumnId: null,
    }),
    fixture(SYNTHETIC_P13N_IDS.webhookDeliveries, "webhook-deliveries-card-store", {
      columnOrder: [],
      columnWidths: inputJson({}),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "desc", field: "createdAt" }),
      pagination: inputJson({ page: 1, pageSize: 25 }),
      hiddenColumns: [],
      viewMode: null,
      groupingColumnId: null,
    }),
    fixture(SYNTHETIC_P13N_IDS.organizations, "organizations-card-store", {
      columnOrder: [
        "contacts",
        "deals",
        "tasks",
        customColumnIds.organizationType,
        customColumnIds.organizationWebsite,
        "updatedAt",
        "createdAt",
        "users",
      ],
      columnWidths: inputJson({ deals: 227, tasks: 191 }),
      filters: inputJson([]),
      searchTerm: null,
      sortDescriptor: inputJson({ direction: "asc", field: "name" }),
      pagination: inputJson({ page: 1, pageSize: 100 }),
      hiddenColumns: ["createdAt"],
      viewMode: "table",
      groupingColumnId: null,
    }),
    detailFixture(
      SYNTHETIC_P13N_IDS.contactDetail,
      CONTACT_DETAIL_P13N_ID,
      [customColumnIds.contactSalesPipeline, customColumnIds.contactPhone],
      [
        CONTACT_DETAIL_FIELD.firstName,
        CONTACT_DETAIL_FIELD.lastName,
        customColumnIds.contactSalesPipeline,
        customColumnIds.contactPhone,
        CONTACT_DETAIL_FIELD.userIds,
        CONTACT_DETAIL_FIELD.updatedAt,
      ],
    ),
    detailFixture(
      SYNTHETIC_P13N_IDS.organizationDetail,
      ORGANIZATION_DETAIL_P13N_ID,
      [customColumnIds.organizationType, customColumnIds.organizationWebsite],
      [ORGANIZATION_DETAIL_FIELD.contactIds, ORGANIZATION_DETAIL_FIELD.userIds, ORGANIZATION_DETAIL_FIELD.updatedAt],
    ),
    detailFixture(
      SYNTHETIC_P13N_IDS.dealDetail,
      DEAL_DETAIL_P13N_ID,
      [customColumnIds.dealStatus, customColumnIds.dealProjectPeriod],
      [
        DEAL_DETAIL_FIELD.totalValue,
        DEAL_DETAIL_FIELD.totalQuantity,
        DEAL_DETAIL_FIELD.organizationIds,
        customColumnIds.dealStatus,
        customColumnIds.dealProjectPeriod,
      ],
    ),
    detailFixture(
      SYNTHETIC_P13N_IDS.serviceDetail,
      SERVICE_DETAIL_P13N_ID,
      [customColumnIds.serviceType, customColumnIds.servicePricing],
      [
        SERVICE_DETAIL_FIELD.amount,
        customColumnIds.serviceType,
        customColumnIds.servicePricing,
        SERVICE_DETAIL_FIELD.userIds,
      ],
    ),
    detailFixture(
      SYNTHETIC_P13N_IDS.taskDetail,
      TASK_DETAIL_P13N_ID,
      [customColumnIds.taskPriority, customColumnIds.taskStatus],
      [customColumnIds.taskPriority, customColumnIds.taskStatus, TASK_DETAIL_FIELD.updatedAt],
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
}
