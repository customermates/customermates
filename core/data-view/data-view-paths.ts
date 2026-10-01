import { z } from "zod";
import { SURFACE, type DataViewSurfaceKey, type BuiltinDataViewSurfaceKey } from "./data-view-keys";

export const DATA_VIEW_PATHS: Readonly<Record<BuiltinDataViewSurfaceKey, string | null>> = Object.freeze({
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

export const ENTITY_TIMELINE_PARENT_PATHS = Object.freeze(
  [SURFACE.contacts, SURFACE.organizations, SURFACE.deals, SURFACE.services, SURFACE.tasks].map(
    (surfaceKey) => DATA_VIEW_PATHS[surfaceKey] as string,
  ),
);

export function dataViewPath(surface: DataViewSurfaceKey): string | null {
  if (surface.startsWith("records:")) return `/records/${surface.slice(8)}`;
  return DATA_VIEW_PATHS[surface as BuiltinDataViewSurfaceKey];
}

export function isRecordTimelinePath(path: string) {
  const generic = path.split("/");
  if (generic.length === 4 && generic[1] === "records")
    return z.uuid().safeParse(generic[2]).success && z.uuid().safeParse(generic[3]).success;
  const parent = ENTITY_TIMELINE_PARENT_PATHS.find((candidate) => path.startsWith(`${candidate}/`));
  return Boolean(parent && z.uuid().safeParse(path.slice(parent.length + 1)).success);
}
