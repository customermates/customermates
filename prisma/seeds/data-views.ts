import type { DateBucket } from "@/core/base/grouping/grouping.schema";
import type { DataViewState } from "@/core/data-view/data-view-state.schema";
import type { PrismaClient } from "@/generated/prisma";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { writeStoredState } from "@/features/data-view/data-view-row-mapping";
import { MessagingProvider, MessagingThreadState } from "@/generated/prisma";

import type { SeedContext } from "./context";
import type { CustomFieldSeedData } from "./custom-fields";
import { syntheticRecordKeys } from "./record-keys";

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
  const { customFieldIds, customOptionIds } = customFields;
  const { user } = context.ids;
  const { id, surface, relationship, path } = syntheticRecordKeys(context.ids.company);

  const board = (field: string, bucket?: DateBucket): Pick<DataViewState, "viewMode" | "grouping"> => ({
    viewMode: ViewMode.card,
    grouping: bucket ? { field, bucket } : { field },
  });

  const selected = (field: string, values: string[]): DataViewState["filters"] => [
    { field, operator: FilterOperatorKey.in, value: values },
  ];

  const sorted = (field: string, direction: "asc" | "desc"): DataViewState["sortDescriptor"] => ({ field, direction });

  const dealContacts = relationship("deal.contacts", "outgoing");
  const dealOrganizations = relationship("deal.organizations", "outgoing");
  const dealServices = path("deal.services.path");
  const dealTasks = relationship("task.deals", "incoming");
  const dealLineItems = relationship("lineItem.deal", "incoming");
  const contactTasks = relationship("task.contacts", "incoming");
  const contactNameParts = [id("contact.firstName"), id("contact.lastName"), id("contact.avatarUrl")];
  const organizationTasks = relationship("task.organizations", "incoming");
  const serviceTasks = relationship("task.services", "incoming");
  const serviceLineItems = relationship("lineItem.service", "incoming");

  return [
    {
      id: SYNTHETIC_DATA_VIEW_IDS.openDeals,
      userId: user,
      surfaceKey: surface("deal"),
      name: "Open deals",
      position: 0,
      state: {
        filters: selected(customFieldIds.dealStatus, [customOptionIds.dealStatus.open]),
        ...board(customFieldIds.dealStatus),
        hiddenColumns: [
          customFieldIds.dealStatus,
          dealContacts,
          dealServices,
          dealTasks,
          id("deal.totalQuantity"),
          "system:assignedTo",
          "system:createdAt",
          "system:updatedAt",
          dealLineItems,
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.dealPipeline,
      userId: user,
      surfaceKey: surface("deal"),
      name: "Sales pipeline",
      position: 1,
      state: {
        ...board(customFieldIds.dealStatus),
        sortDescriptor: sorted(id("deal.totalValue"), "desc"),
        hiddenColumns: [
          customFieldIds.dealStatus,
          dealContacts,
          dealServices,
          dealTasks,
          id("deal.totalQuantity"),
          "system:assignedTo",
          "system:createdAt",
          "system:updatedAt",
          dealLineItems,
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.dealForecast,
      userId: user,
      surfaceKey: surface("deal"),
      name: "Forecast review",
      position: 2,
      state: {
        viewMode: ViewMode.table,
        sortDescriptor: sorted(id("deal.weightedValue"), "desc"),
        pageSize: 25,
        columnOrder: [
          id("deal.totalValue"),
          id("deal.weightedValue"),
          customFieldIds.dealStatus,
          dealOrganizations,
          "system:assignedTo",
        ],
        columnWidths: { [id("deal.totalValue")]: 160, [id("deal.weightedValue")]: 180 },
        hiddenColumns: [
          dealContacts,
          dealServices,
          dealTasks,
          id("deal.totalQuantity"),
          "system:createdAt",
          "system:updatedAt",
          dealLineItems,
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.dealsByAccount,
      userId: user,
      surfaceKey: surface("deal"),
      name: "By account",
      position: 3,
      state: {
        ...board(dealOrganizations),
        hiddenColumns: [
          dealOrganizations,
          dealContacts,
          dealTasks,
          id("deal.totalQuantity"),
          "system:assignedTo",
          "system:createdAt",
          "system:updatedAt",
          dealLineItems,
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactPipeline,
      userId: user,
      surfaceKey: surface("contact"),
      name: "Lead pipeline",
      position: 0,
      state: {
        ...board(customFieldIds.contactSalesPipeline),
        hiddenColumns: [
          customFieldIds.contactSalesPipeline,
          customFieldIds.contactPhone,
          "system:channels",
          contactTasks,
          "system:assignedTo",
          "system:createdAt",
          "system:updatedAt",
          ...contactNameParts,
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactsInPlay,
      userId: user,
      surfaceKey: surface("contact"),
      name: "In play",
      position: 1,
      state: {
        filters: selected(customFieldIds.contactSalesPipeline, [
          customOptionIds.contactSalesPipeline.contact,
          customOptionIds.contactSalesPipeline.qualified,
          customOptionIds.contactSalesPipeline.inProgress,
        ]),
        viewMode: ViewMode.table,
        sortDescriptor: sorted("system:updatedAt", "desc"),
        columnOrder: [
          customFieldIds.contactSalesPipeline,
          relationship("contact.organizations", "outgoing"),
          relationship("deal.contacts", "incoming"),
          "system:assignedTo",
        ],
        hiddenColumns: ["system:channels", contactTasks, "system:createdAt", ...contactNameParts],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.contactsRecentlyAdded,
      userId: user,
      surfaceKey: surface("contact"),
      name: "Added by month",
      position: 2,
      state: {
        viewMode: ViewMode.table,
        grouping: { field: "system:createdAt", bucket: "month" },
        sortDescriptor: sorted("system:createdAt", "desc"),
        pageSize: 25,
        hiddenColumns: ["system:channels", contactTasks, "system:updatedAt", ...contactNameParts],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.organizationsByType,
      userId: user,
      surfaceKey: surface("organization"),
      name: "Accounts by type",
      position: 0,
      state: {
        ...board(customFieldIds.organizationType),
        hiddenColumns: [
          customFieldIds.organizationType,
          customFieldIds.organizationWebsite,
          organizationTasks,
          "system:assignedTo",
          "system:createdAt",
          "system:updatedAt",
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.directCustomers,
      userId: user,
      surfaceKey: surface("organization"),
      name: "Direct customers",
      position: 1,
      state: {
        filters: selected(customFieldIds.organizationType, [customOptionIds.organizationType.directCustomer]),
        viewMode: ViewMode.table,
        sortDescriptor: sorted(id("organization.name"), "asc"),
        columnOrder: [
          customFieldIds.organizationType,
          relationship("deal.organizations", "incoming"),
          relationship("contact.organizations", "incoming"),
          "system:assignedTo",
        ],
        columnWidths: { [id("organization.name")]: 260 },
        hiddenColumns: [organizationTasks, "system:createdAt"],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.serviceCatalogue,
      userId: user,
      surfaceKey: surface("service"),
      name: "Catalogue by pricing",
      position: 0,
      state: {
        ...board(customFieldIds.servicePricing),
        hiddenColumns: [
          customFieldIds.servicePricing,
          serviceTasks,
          "system:assignedTo",
          "system:createdAt",
          "system:updatedAt",
          serviceLineItems,
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.hardwareServices,
      userId: user,
      surfaceKey: surface("service"),
      name: "Hardware",
      position: 1,
      state: {
        filters: selected(customFieldIds.serviceType, [customOptionIds.serviceType.hardware]),
        viewMode: ViewMode.table,
        sortDescriptor: sorted(id("service.amount"), "desc"),
        columnOrder: [id("service.amount"), customFieldIds.servicePricing, path("service.deals.path")],
        hiddenColumns: [serviceTasks, "system:assignedTo", "system:createdAt", "system:updatedAt", serviceLineItems],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.servicesRecentlyUpdated,
      userId: user,
      surfaceKey: surface("service"),
      name: "Updated by week",
      position: 2,
      state: {
        viewMode: ViewMode.table,
        grouping: { field: "system:updatedAt", bucket: "week" },
        sortDescriptor: sorted("system:updatedAt", "desc"),
        hiddenColumns: [serviceTasks, "system:createdAt", serviceLineItems],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.taskBoard,
      userId: user,
      surfaceKey: surface("task"),
      name: "Delivery board",
      position: 0,
      state: {
        ...board(customFieldIds.taskStatus),
        hiddenColumns: [
          customFieldIds.taskStatus,
          relationship("task.contacts", "outgoing"),
          relationship("task.services", "outgoing"),
          "system:assignedTo",
          "system:createdAt",
          "system:updatedAt",
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.highPriorityTasks,
      userId: user,
      surfaceKey: surface("task"),
      name: "High priority",
      position: 1,
      state: {
        filters: selected(customFieldIds.taskPriority, [customOptionIds.taskPriority.high]),
        viewMode: ViewMode.table,
        sortDescriptor: sorted("system:updatedAt", "desc"),
        columnOrder: [
          customFieldIds.taskPriority,
          customFieldIds.taskStatus,
          relationship("task.deals", "outgoing"),
          "system:assignedTo",
        ],
        hiddenColumns: [
          relationship("task.contacts", "outgoing"),
          relationship("task.organizations", "outgoing"),
          relationship("task.services", "outgoing"),
          "system:createdAt",
        ],
      },
    },
    {
      id: SYNTHETIC_DATA_VIEW_IDS.tasksByPriority,
      userId: user,
      surfaceKey: surface("task"),
      name: "Priority list",
      position: 2,
      state: {
        viewMode: ViewMode.table,
        grouping: { field: customFieldIds.taskPriority },
        sortDescriptor: sorted(id("task.name"), "asc"),
        columnOrder: [
          customFieldIds.taskStatus,
          relationship("task.deals", "outgoing"),
          relationship("task.organizations", "outgoing"),
        ],
        hiddenColumns: [
          relationship("task.contacts", "outgoing"),
          relationship("task.services", "outgoing"),
          "system:assignedTo",
          "system:createdAt",
          "system:updatedAt",
        ],
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
  await persistSyntheticDataViewFixtures(
    context.prisma,
    context.ids.company,
    buildSyntheticDataViewFixtures(context, customFields),
  );
}
