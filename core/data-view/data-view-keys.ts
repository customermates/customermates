export const ALL_VIEW_KEY = "__all__";

export const SURFACE = Object.freeze({
  contacts: "contacts-card-store",
  organizations: "organizations-card-store",
  deals: "deals-card-store",
  services: "services-card-store",
  tasks: "tasks-card-store",
  users: "users-card-store",
  roles: "roles-card-store",
  webhooks: "webhooks-card-store",
  webhookDeliveries: "webhook-deliveries-card-store",
  auditLogs: "audit-logs-card-store",
  messagingThreads: "messaging-threads-card-store",
  entityTimeline: "entity-timeline",
  operatorUsers: "operator-users",
  operatorWorkspaces: "operator-workspaces",
  operatorAudit: "operator-audit",
} as const);

export const DATA_VIEW_SURFACE_KEYS = [
  SURFACE.contacts,
  SURFACE.organizations,
  SURFACE.deals,
  SURFACE.services,
  SURFACE.tasks,
  SURFACE.users,
  SURFACE.roles,
  SURFACE.webhooks,
  SURFACE.webhookDeliveries,
  SURFACE.auditLogs,
  SURFACE.messagingThreads,
  SURFACE.entityTimeline,
  SURFACE.operatorUsers,
  SURFACE.operatorWorkspaces,
  SURFACE.operatorAudit,
] as const;

export type DataViewSurfaceKey = (typeof DATA_VIEW_SURFACE_KEYS)[number];

export type DataViewSurfaceDescriptor = {
  kind: "list" | "embedded";
  linkable: boolean;
};

const LIST_SURFACE: DataViewSurfaceDescriptor = { kind: "list", linkable: true };
const EMBEDDED_SURFACE: DataViewSurfaceDescriptor = { kind: "embedded", linkable: false };

export const DATA_VIEW_SURFACES: Readonly<Record<DataViewSurfaceKey, DataViewSurfaceDescriptor>> = Object.freeze({
  [SURFACE.contacts]: LIST_SURFACE,
  [SURFACE.organizations]: LIST_SURFACE,
  [SURFACE.deals]: LIST_SURFACE,
  [SURFACE.services]: LIST_SURFACE,
  [SURFACE.tasks]: LIST_SURFACE,
  [SURFACE.users]: LIST_SURFACE,
  [SURFACE.roles]: LIST_SURFACE,
  [SURFACE.webhooks]: LIST_SURFACE,
  [SURFACE.webhookDeliveries]: LIST_SURFACE,
  [SURFACE.auditLogs]: LIST_SURFACE,
  [SURFACE.messagingThreads]: LIST_SURFACE,
  [SURFACE.entityTimeline]: EMBEDDED_SURFACE,
  [SURFACE.operatorUsers]: LIST_SURFACE,
  [SURFACE.operatorWorkspaces]: LIST_SURFACE,
  [SURFACE.operatorAudit]: LIST_SURFACE,
});

export function isDataViewSurfaceKey(key: string | undefined): key is DataViewSurfaceKey {
  return key !== undefined && key in DATA_VIEW_SURFACES;
}

export function isLinkableSurface(key: string | undefined): boolean {
  return isDataViewSurfaceKey(key) && DATA_VIEW_SURFACES[key].linkable;
}
