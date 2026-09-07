import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { PrismaClient } from "@/generated/prisma";

import { SURFACE } from "@/core/data-view/data-view-keys";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { MessagingThreadState } from "@/generated/prisma";
import { writeStoredState } from "@/features/data-view/data-view-row-mapping";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";

import { SYNTHETIC_DATA_VIEW_ID_PREFIX, SYNTHETIC_DATA_VIEW_IDS } from "./data-view-ids";

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

  const board = (field: string): Pick<DataViewState, "viewMode" | "grouping"> => ({
    viewMode: ViewMode.card,
    grouping: { field },
  });

  const selected = (field: string, values: string[]): DataViewState["filters"] => [
    { field, operator: FilterOperatorKey.in, value: values },
  ];

  return [
    {
      id: SYNTHETIC_DATA_VIEW_IDS.openDeals,
      userId: user,
      surfaceKey: SURFACE.deals,
      name: "Open deals",
      position: 0,
      state: {
        filters: selected(customColumnIds.dealStatus, [customOptionIds.dealStatus.open]),
        ...board(customColumnIds.dealStatus),
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.dealPipeline,
      userId: user,
      surfaceKey: SURFACE.deals,
      name: "Sales pipeline",
      position: 1,
      state: board(customColumnIds.dealStatus),
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactPipeline,
      userId: user,
      surfaceKey: SURFACE.contacts,
      name: "Lead pipeline",
      position: 0,
      state: board(customColumnIds.contactSalesPipeline),
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactsInPlay,
      userId: user,
      surfaceKey: SURFACE.contacts,
      name: "In play",
      position: 1,
      state: {
        filters: selected(customColumnIds.contactSalesPipeline, [
          customOptionIds.contactSalesPipeline.contact,
          customOptionIds.contactSalesPipeline.qualified,
          customOptionIds.contactSalesPipeline.inProgress,
        ]),
        viewMode: ViewMode.table,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.organizationsByType,
      userId: user,
      surfaceKey: SURFACE.organizations,
      name: "Accounts by type",
      position: 0,
      state: board(customColumnIds.organizationType),
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.directCustomers,
      userId: user,
      surfaceKey: SURFACE.organizations,
      name: "Direct customers",
      position: 1,
      state: {
        filters: selected(customColumnIds.organizationType, [customOptionIds.organizationType.directCustomer]),
        viewMode: ViewMode.table,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.serviceCatalogue,
      userId: user,
      surfaceKey: SURFACE.services,
      name: "Catalogue by pricing",
      position: 0,
      state: board(customColumnIds.servicePricing),
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.hardwareServices,
      userId: user,
      surfaceKey: SURFACE.services,
      name: "Hardware",
      position: 1,
      state: {
        filters: selected(customColumnIds.serviceType, [customOptionIds.serviceType.hardware]),
        viewMode: ViewMode.table,
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.taskBoard,
      userId: user,
      surfaceKey: SURFACE.tasks,
      name: "Delivery board",
      position: 0,
      state: board(customColumnIds.taskStatus),
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.highPriorityTasks,
      userId: user,
      surfaceKey: SURFACE.tasks,
      name: "High priority",
      position: 1,
      state: {
        filters: selected(customColumnIds.taskPriority, [customOptionIds.taskPriority.high]),
        viewMode: ViewMode.table,
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
  const views = buildSyntheticDataViewFixtures(context, customFields);

  await persistSyntheticDataViewFixtures(context.prisma, context.ids.company, views);
}
