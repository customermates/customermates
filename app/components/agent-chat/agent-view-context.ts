import { z } from "zod";
import { stripLocalePrefix } from "@/i18n/locale-registry";
import { DATA_VIEW_PATHS, ENTITY_TIMELINE_PARENT_PATHS } from "@/core/data-view/data-view-paths";
import { SURFACE, type DataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import { SurfaceKeySchema, ViewKeySchema } from "@/core/data-view/data-view-state.schema";
import { GET_PARAM_KEYS } from "@/core/utils/get-params";

type ViewContext = { surfaceKey: string; viewKey: string };
type Registration = { pathname: string; read: () => ViewContext | null; prepare?: () => Promise<void> };
export type AgentViewChange = {
  surfaceKey: DataViewSurfaceKey;
  action?: "create" | "update" | "select" | "delete";
  viewKey?: string;
};

function isTimelineRecordPath(pathname: string) {
  const path = stripLocalePrefix(pathname);
  const parent = ENTITY_TIMELINE_PARENT_PATHS.find((candidate) => path.startsWith(`${candidate}/`));
  return Boolean(parent && z.uuid().safeParse(path.slice(parent.length + 1)).success);
}

export class AgentViewContext {
  private registrations: Registration[] = [];

  private get registration(): Registration | undefined {
    return this.registrations.at(-1);
  }

  register(pathname: string, read: Registration["read"], prepare?: Registration["prepare"]): () => void {
    const registration = { pathname, read, prepare };
    this.registrations.push(registration);
    return () => {
      this.registrations = this.registrations.filter((entry) => entry !== registration);
    };
  }

  private current(pathname: string) {
    if (this.registration?.pathname !== pathname) return null;
    const value = this.registration.read();
    const surface = SurfaceKeySchema.safeParse(value?.surfaceKey);
    const view = ViewKeySchema.safeParse(value?.viewKey);
    return surface.success && view.success ? { surfaceKey: surface.data, viewKey: view.data } : null;
  }

  route(pathname: string): string {
    const view = this.current(pathname);
    if (!view) return pathname;
    const query = new URLSearchParams({
      view: view.viewKey,
      viewSurface: view.surfaceKey,
    });
    return `${pathname}?${query}`;
  }

  prepare(route: string): Promise<void> | undefined {
    const url = new URL(route, "http://localhost");
    const current = this.current(url.pathname);
    if (
      current?.surfaceKey !== url.searchParams.get("viewSurface") ||
      current?.viewKey !== url.searchParams.get("view")
    )
      return;
    return this.registration?.prepare?.();
  }

  reloadHref(href: string, changes: readonly AgentViewChange[]): string | null {
    const url = new URL(href);
    const view = this.current(url.pathname);
    if (!view) return null;
    const matching = changes.filter((change) => change.surfaceKey === view.surfaceKey);
    if (!matching.length) return null;
    const ownedPath = DATA_VIEW_PATHS[view.surfaceKey];
    const timelineDetail = view.surfaceKey === SURFACE.entityTimeline && isTimelineRecordPath(url.pathname);
    if ((!ownedPath || stripLocalePrefix(url.pathname) !== ownedPath) && !timelineDetail) return null;
    const selectionChanged = matching.some(
      (change) =>
        change.action === "create" ||
        change.action === "select" ||
        (change.action === "delete" && change.viewKey === view.viewKey),
    );
    const currentViewUpdated = matching.some((change) => change.action === "update" && change.viewKey === view.viewKey);
    if (!selectionChanged && !currentViewUpdated) return null;
    for (const key of GET_PARAM_KEYS) url.searchParams.delete(key);
    url.searchParams.delete("viewSurface");
    url.searchParams.delete("viewAction");
    if (!selectionChanged) {
      url.searchParams.set("view", view.viewKey);
      if (timelineDetail) url.searchParams.set("viewSurface", SURFACE.entityTimeline);
    }
    return `${url.pathname}${url.search}${url.hash}`;
  }
}
