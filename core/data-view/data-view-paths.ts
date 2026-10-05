import { z } from "zod";
import { SURFACE, type DataViewSurfaceKey, type BuiltinDataViewSurfaceKey } from "./data-view-keys";

export const DATA_VIEW_PATHS: Readonly<Record<BuiltinDataViewSurfaceKey, string | null>> = Object.freeze({
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

export function dataViewPath(surface: DataViewSurfaceKey): string | null {
  if (surface.startsWith("records:")) return `/records/${surface.slice(8)}`;
  return DATA_VIEW_PATHS[surface as BuiltinDataViewSurfaceKey];
}

export function isRecordTimelinePath(path: string) {
  const segments = path.split("/");
  return (
    segments.length === 4 &&
    segments[1] === "records" &&
    z.uuid().safeParse(segments[2]).success &&
    z.uuid().safeParse(segments[3]).success
  );
}
