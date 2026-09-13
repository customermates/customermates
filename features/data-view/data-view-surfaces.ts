import { EntityType, Resource } from "@/generated/prisma";
import { SURFACE, type DataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import { DATA_VIEW_PATHS } from "@/core/data-view/data-view-paths";

type SurfaceDescriptor = {
  label: string;
  path: string | null;
  resource?: Resource;
  readAllOnly?: boolean;
  entityType?: EntityType;
  messaging?: boolean;
  operator?: boolean;
};

export const DATA_VIEW_SURFACES: Record<DataViewSurfaceKey, SurfaceDescriptor> = {
  [SURFACE.contacts]: {
    label: "Contacts",
    path: DATA_VIEW_PATHS[SURFACE.contacts],
    resource: Resource.contacts,
    entityType: EntityType.contact,
  },
  [SURFACE.organizations]: {
    label: "Organizations",
    path: DATA_VIEW_PATHS[SURFACE.organizations],
    resource: Resource.organizations,
    entityType: EntityType.organization,
  },
  [SURFACE.deals]: {
    label: "Deals",
    path: DATA_VIEW_PATHS[SURFACE.deals],
    resource: Resource.deals,
    entityType: EntityType.deal,
  },
  [SURFACE.services]: {
    label: "Services",
    path: DATA_VIEW_PATHS[SURFACE.services],
    resource: Resource.services,
    entityType: EntityType.service,
  },
  [SURFACE.tasks]: {
    label: "Tasks",
    path: DATA_VIEW_PATHS[SURFACE.tasks],
    resource: Resource.tasks,
    entityType: EntityType.task,
  },
  [SURFACE.users]: {
    label: "Members",
    path: DATA_VIEW_PATHS[SURFACE.users],
    resource: Resource.users,
  },
  [SURFACE.roles]: {
    label: "Roles",
    path: DATA_VIEW_PATHS[SURFACE.roles],
    resource: Resource.users,
  },
  [SURFACE.webhooks]: {
    label: "Webhooks",
    path: DATA_VIEW_PATHS[SURFACE.webhooks],
    resource: Resource.api,
    readAllOnly: true,
  },
  [SURFACE.webhookDeliveries]: {
    label: "Webhook deliveries",
    path: DATA_VIEW_PATHS[SURFACE.webhookDeliveries],
    resource: Resource.api,
    readAllOnly: true,
  },
  [SURFACE.auditLogs]: {
    label: "Audit logs",
    path: DATA_VIEW_PATHS[SURFACE.auditLogs],
    resource: Resource.auditLog,
    readAllOnly: true,
  },
  [SURFACE.messagingThreads]: {
    label: "Inbox",
    path: DATA_VIEW_PATHS[SURFACE.messagingThreads],
    resource: Resource.inboxMessages,
    messaging: true,
  },
  [SURFACE.entityTimeline]: { label: "Record activity timeline", path: DATA_VIEW_PATHS[SURFACE.entityTimeline] },
  [SURFACE.operatorUsers]: {
    label: "Operator users",
    path: DATA_VIEW_PATHS[SURFACE.operatorUsers],
    operator: true,
  },
  [SURFACE.operatorWorkspaces]: {
    label: "Operator workspaces",
    path: DATA_VIEW_PATHS[SURFACE.operatorWorkspaces],
    operator: true,
  },
  [SURFACE.operatorAudit]: {
    label: "Operator audit",
    path: DATA_VIEW_PATHS[SURFACE.operatorAudit],
    operator: true,
  },
  [SURFACE.routines]: {
    label: "Routines",
    path: DATA_VIEW_PATHS[SURFACE.routines],
    resource: Resource.routines,
  },
};
