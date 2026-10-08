import { z } from "zod";
import { SURFACE, type DataViewSurfaceKey, type BuiltinDataViewSurfaceKey } from "./data-view-keys";
import { settingsHref, WEBHOOK_DELIVERIES_HREF } from "@/app/components/navigation/settings-routes";

export const DATA_VIEW_PATHS: Readonly<Record<BuiltinDataViewSurfaceKey, string | null>> = Object.freeze({
  [SURFACE.users]: settingsHref("members"),
  [SURFACE.roles]: settingsHref("roles"),
  [SURFACE.webhooks]: settingsHref("webhooks"),
  [SURFACE.webhookDeliveries]: WEBHOOK_DELIVERIES_HREF,
  [SURFACE.messagingThreads]: "/inbox",
  [SURFACE.entityTimeline]: null,
  [SURFACE.activity]: settingsHref("activity"),
  [SURFACE.operatorUsers]: "/operator/users",
  [SURFACE.operatorWorkspaces]: "/operator/workspaces",
  [SURFACE.operatorAudit]: "/operator/audit",
  [SURFACE.routines]: "/routines",
  [SURFACE.dashboard]: "/dashboard",
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
