import type { DateBucket } from "@/core/base/grouping/grouping.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import { presetId } from "@/features/records/crm-preset";
import type { PrismaClient } from "@/generated/prisma";
import type { LegacyType } from "./legacy-conversion/v2/legacy-model";
import { migratePresentationState } from "./legacy-conversion/v5/state";
import { syntheticRecordModel } from "./records";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { writeStoredState } from "@/features/data-view/data-view-row-mapping";
import { MessagingProvider, MessagingThreadState } from "@/generated/prisma";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";

import { SYNTHETIC_DATA_VIEW_ID_PREFIX, SYNTHETIC_DATA_VIEW_IDS } from "./data-view-ids";

const LEGACY_SURFACE = {
  contacts: "contacts-card-store",
  organizations: "organizations-card-store",
  deals: "deals-card-store",
  services: "services-card-store",
  tasks: "tasks-card-store",
} as const;

export { SYNTHETIC_DATA_VIEW_ID_PREFIX, SYNTHETIC_DATA_VIEW_IDS } from "./data-view-ids";

export type SyntheticDataViewFixture = {
  id: string;
  userId: string;
  surfaceKey: string;
  name: string;
  position: number;
  state: DataViewState;
};

export function buildSyntheticDataViewFixtures(
  context: Pick<SeedContext, "ids">,
  customFields: CustomFieldSeedData,
): SyntheticDataViewFixture[] {
  const { customColumnIds, customOptionIds } = customFields;
  const { user } = context.ids;

  const board = (field: string, bucket?: DateBucket): Pick<DataViewState, "viewMode" | "grouping"> => ({
    viewMode: ViewMode.card,
    grouping: bucket ? { field, bucket } : { field },
  });

  const selected = (field: string, values: string[]): DataViewState["filters"] => [
    { field, operator: FilterOperatorKey.in, value: values },
  ];

  const sorted = (field: string, direction: "asc" | "desc"): DataViewState["sortDescriptor"] => ({ field, direction });

  return [
    {
      id: SYNTHETIC_DATA_VIEW_IDS.openDeals,
      userId: user,
      surfaceKey: LEGACY_SURFACE.deals,
      name: "Open deals",
      position: 0,
      state: {
        filters: selected(customColumnIds.dealStatus, [customOptionIds.dealStatus.open]),
        ...board(customColumnIds.dealStatus),
        hiddenColumns: [
          customColumnIds.dealStatus,
          "contacts",
          "services",
          "tasks",
          "totalQuantity",
          "users",
          "createdAt",
          "updatedAt",
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.dealPipeline,
      userId: user,
      surfaceKey: LEGACY_SURFACE.deals,
      name: "Sales pipeline",
      position: 1,
      state: {
        ...board(customColumnIds.dealStatus),
        sortDescriptor: sorted("totalValue", "desc"),
        hiddenColumns: [
          customColumnIds.dealStatus,
          "contacts",
          "services",
          "tasks",
          "totalQuantity",
          "users",
          "createdAt",
          "updatedAt",
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.dealForecast,
      userId: user,
      surfaceKey: LEGACY_SURFACE.deals,
      name: "Forecast review",
      position: 2,
      state: {
        viewMode: ViewMode.table,
        sortDescriptor: sorted("weightedValue", "desc"),
        pageSize: 25,
        columnOrder: ["totalValue", "weightedValue", customColumnIds.dealStatus, "organizations", "users"],
        columnWidths: { totalValue: 160, weightedValue: 180 },
        hiddenColumns: ["contacts", "services", "tasks", "totalQuantity", "createdAt", "updatedAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.dealsByAccount,
      userId: user,
      surfaceKey: LEGACY_SURFACE.deals,
      name: "By account",
      position: 3,
      state: {
        ...board("organizationIds"),
        hiddenColumns: ["organizations", "contacts", "tasks", "totalQuantity", "users", "createdAt", "updatedAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactPipeline,
      userId: user,
      surfaceKey: LEGACY_SURFACE.contacts,
      name: "Lead pipeline",
      position: 0,
      state: {
        ...board(customColumnIds.contactSalesPipeline),
        hiddenColumns: [
          customColumnIds.contactSalesPipeline,
          customColumnIds.contactPhone,
          "channels",
          "tasks",
          "users",
          "createdAt",
          "updatedAt",
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactsInPlay,
      userId: user,
      surfaceKey: LEGACY_SURFACE.contacts,
      name: "In play",
      position: 1,
      state: {
        filters: selected(customColumnIds.contactSalesPipeline, [
          customOptionIds.contactSalesPipeline.contact,
          customOptionIds.contactSalesPipeline.qualified,
          customOptionIds.contactSalesPipeline.inProgress,
        ]),
        viewMode: ViewMode.table,
        sortDescriptor: sorted("updatedAt", "desc"),
        columnOrder: [customColumnIds.contactSalesPipeline, "organizations", "deals", "users"],
        hiddenColumns: ["channels", "tasks", "createdAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactsRecentlyAdded,
      userId: user,
      surfaceKey: LEGACY_SURFACE.contacts,
      name: "Added by month",
      position: 2,
      state: {
        viewMode: ViewMode.table,
        grouping: { field: "createdAt", bucket: "month" },
        sortDescriptor: sorted("createdAt", "desc"),
        pageSize: 25,
        hiddenColumns: ["channels", "tasks", "updatedAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.organizationsByType,
      userId: user,
      surfaceKey: LEGACY_SURFACE.organizations,
      name: "Accounts by type",
      position: 0,
      state: {
        ...board(customColumnIds.organizationType),
        hiddenColumns: [
          customColumnIds.organizationType,
          customColumnIds.organizationWebsite,
          "tasks",
          "users",
          "createdAt",
          "updatedAt",
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.directCustomers,
      userId: user,
      surfaceKey: LEGACY_SURFACE.organizations,
      name: "Direct customers",
      position: 1,
      state: {
        filters: selected(customColumnIds.organizationType, [customOptionIds.organizationType.directCustomer]),
        viewMode: ViewMode.table,
        sortDescriptor: sorted("name", "asc"),
        columnOrder: [customColumnIds.organizationType, "deals", "contacts", "users"],
        columnWidths: { name: 260 },
        hiddenColumns: ["tasks", "createdAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.serviceCatalogue,
      userId: user,
      surfaceKey: LEGACY_SURFACE.services,
      name: "Catalogue by pricing",
      position: 0,
      state: {
        ...board(customColumnIds.servicePricing),
        hiddenColumns: [customColumnIds.servicePricing, "tasks", "users", "createdAt", "updatedAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.hardwareServices,
      userId: user,
      surfaceKey: LEGACY_SURFACE.services,
      name: "Hardware",
      position: 1,
      state: {
        filters: selected(customColumnIds.serviceType, [customOptionIds.serviceType.hardware]),
        viewMode: ViewMode.table,
        sortDescriptor: sorted("amount", "desc"),
        columnOrder: ["amount", customColumnIds.servicePricing, "deals"],
        hiddenColumns: ["tasks", "users", "createdAt", "updatedAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.servicesRecentlyUpdated,
      userId: user,
      surfaceKey: LEGACY_SURFACE.services,
      name: "Updated by week",
      position: 2,
      state: {
        viewMode: ViewMode.table,
        grouping: { field: "updatedAt", bucket: "week" },
        sortDescriptor: sorted("updatedAt", "desc"),
        hiddenColumns: ["tasks", "createdAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.taskBoard,
      userId: user,
      surfaceKey: LEGACY_SURFACE.tasks,
      name: "Delivery board",
      position: 0,
      state: {
        ...board(customColumnIds.taskStatus),
        hiddenColumns: [customColumnIds.taskStatus, "contacts", "services", "users", "createdAt", "updatedAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.highPriorityTasks,
      userId: user,
      surfaceKey: LEGACY_SURFACE.tasks,
      name: "High priority",
      position: 1,
      state: {
        filters: selected(customColumnIds.taskPriority, [customOptionIds.taskPriority.high]),
        viewMode: ViewMode.table,
        sortDescriptor: sorted("updatedAt", "desc"),
        columnOrder: [customColumnIds.taskPriority, customColumnIds.taskStatus, "deals", "users"],
        hiddenColumns: ["contacts", "organizations", "services", "createdAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.tasksByPriority,
      userId: user,
      surfaceKey: LEGACY_SURFACE.tasks,
      name: "Priority list",
      position: 2,
      state: {
        viewMode: ViewMode.table,
        grouping: { field: customColumnIds.taskPriority },
        sortDescriptor: sorted("name", "asc"),
        columnOrder: [customColumnIds.taskStatus, "deals", "organizations"],
        hiddenColumns: ["contacts", "services", "users", "createdAt", "updatedAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.inboxDrafts,
      userId: user,
      surfaceKey: SURFACE.messagingThreads,
      name: "Drafts",
      position: 0,
      state: {
        filters: [{ field: FilterFieldKey.draft, operator: FilterOperatorKey.hasSome }],
        viewMode: ViewMode.table,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.inboxUnread,
      userId: user,
      surfaceKey: SURFACE.messagingThreads,
      name: "Unread",
      position: 1,
      state: {
        filters: selected(FilterFieldKey.state, [MessagingThreadState.unread]),
        viewMode: ViewMode.table,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.inboxWhatsApp,
      userId: user,
      surfaceKey: SURFACE.messagingThreads,
      name: "WhatsApp",
      position: 2,
      state: {
        filters: selected(FilterFieldKey.provider, [MessagingProvider.whatsapp]),
        viewMode: ViewMode.table,
      },
    },
  ];
}

export async function persistSyntheticDataViewFixtures(
  prisma: Pick<PrismaClient, "dataView">,
  companyId: string,
  views: SyntheticDataViewFixture[],
): Promise<void> {
  for (const view of views) {
    const { id, state, ...rest } = view;
    const data = { companyId, ...rest, ...writeStoredState(state) };
    await prisma.dataView.upsert({ where: { id }, update: data, create: { id, ...data } });
  }

  await prisma.dataView.deleteMany({
    where: {
      companyId,
      id: { startsWith: `${SYNTHETIC_DATA_VIEW_ID_PREFIX}-`, notIn: views.map(({ id }) => id) },
    },
  });
}

export async function seedDataViews(context: SeedContext, customFields: CustomFieldSeedData): Promise<void> {
  const { source, presentationModel } = syntheticRecordModel(context, customFields);
  const kindBySurface: Record<string, LegacyType> = {
    [LEGACY_SURFACE.contacts]: "contact",
    [LEGACY_SURFACE.organizations]: "organization",
    [LEGACY_SURFACE.deals]: "deal",
    [LEGACY_SURFACE.services]: "service",
    [LEGACY_SURFACE.tasks]: "task",
  };
  const views = buildSyntheticDataViewFixtures(context, customFields).map((view) => {
    const kind = kindBySurface[view.surfaceKey];
    return kind
      ? {
          ...view,
          surfaceKey: `records:${presetId(context.ids.company, kind)}`,
          state: migratePresentationState(source, kind, view.state, presentationModel, false) as DataViewState,
        }
      : view;
  });

  await persistSyntheticDataViewFixtures(context.prisma, context.ids.company, views);
}
