export const ALL_VIEW_KEY = "__all__";

export const SURFACE = Object.freeze({
  users: "users-card-store",
  roles: "roles-card-store",
  webhooks: "webhooks-card-store",
  webhookDeliveries: "webhook-deliveries-card-store",
  messagingThreads: "messaging-threads-card-store",
  entityTimeline: "entity-timeline",
  activity: "activity",
  operatorUsers: "operator-users",
  operatorWorkspaces: "operator-workspaces",
  operatorAudit: "operator-audit",
  routines: "routines-card-store",
} as const);

export const DATA_VIEW_SURFACE_KEYS = [
  SURFACE.users,
  SURFACE.roles,
  SURFACE.webhooks,
  SURFACE.webhookDeliveries,
  SURFACE.messagingThreads,
  SURFACE.entityTimeline,
  SURFACE.activity,
  SURFACE.operatorUsers,
  SURFACE.operatorWorkspaces,
  SURFACE.operatorAudit,
  SURFACE.routines,
] as const;

export type BuiltinDataViewSurfaceKey = (typeof DATA_VIEW_SURFACE_KEYS)[number];
export type RecordSurfaceKey = `records:${string}`;
export type DataViewSurfaceKey = BuiltinDataViewSurfaceKey | RecordSurfaceKey;
export const recordSurfaceKey = (typeId: string): RecordSurfaceKey => `records:${typeId}`;
export const isActivitySurface = (
  surfaceKey: string,
): surfaceKey is typeof SURFACE.entityTimeline | typeof SURFACE.activity =>
  surfaceKey === SURFACE.entityTimeline || surfaceKey === SURFACE.activity;
