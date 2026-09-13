import { SURFACE, type DataViewSurfaceKey } from "./data-view-keys";

export const DATA_VIEW_PATHS: Readonly<Record<DataViewSurfaceKey, string | null>> = Object.freeze({
  [SURFACE.contacts]: "/contacts",
  [SURFACE.organizations]: "/organizations",
  [SURFACE.deals]: "/deals",
  [SURFACE.services]: "/services",
  [SURFACE.tasks]: "/tasks",
  [SURFACE.users]: "/company/members",
  [SURFACE.roles]: "/company/roles",
  [SURFACE.webhooks]: "/company/webhooks",
  [SURFACE.webhookDeliveries]: "/company/webhook-deliveries",
  [SURFACE.auditLogs]: "/company/audit-logs",
  [SURFACE.messagingThreads]: "/inbox",
  [SURFACE.entityTimeline]: null,
  [SURFACE.operatorUsers]: "/operator/users",
  [SURFACE.operatorWorkspaces]: "/operator/workspaces",
  [SURFACE.operatorAudit]: "/operator/audit",
  [SURFACE.routines]: "/routines",
});
