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
