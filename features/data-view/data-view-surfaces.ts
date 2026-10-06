import { Resource } from "@/generated/prisma";
import { SURFACE, type BuiltinDataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import { DATA_VIEW_PATHS } from "@/core/data-view/data-view-paths";

export type SurfaceDescriptor = {
  label: string;
  path: string | null;
  resource?: Resource;
  readAllOnly?: boolean;
  messaging?: boolean;
};

export const DATA_VIEW_SURFACES: Record<BuiltinDataViewSurfaceKey, SurfaceDescriptor> = {
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
  [SURFACE.messagingThreads]: {
    label: "Inbox",
    path: DATA_VIEW_PATHS[SURFACE.messagingThreads],
    resource: Resource.inboxMessages,
    messaging: true,
  },
  [SURFACE.entityTimeline]: {
    label: "Record activity timeline",
    path: DATA_VIEW_PATHS[SURFACE.entityTimeline],
  },
  [SURFACE.operatorUsers]: {
    label: "Operator users",
    path: DATA_VIEW_PATHS[SURFACE.operatorUsers],
  },
  [SURFACE.operatorWorkspaces]: {
    label: "Operator workspaces",
    path: DATA_VIEW_PATHS[SURFACE.operatorWorkspaces],
  },
  [SURFACE.operatorAudit]: {
    label: "Operator audit",
    path: DATA_VIEW_PATHS[SURFACE.operatorAudit],
  },
  [SURFACE.routines]: {
    label: "Routines",
    path: DATA_VIEW_PATHS[SURFACE.routines],
    resource: Resource.routines,
  },
};
