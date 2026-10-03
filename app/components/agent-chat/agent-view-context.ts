import { stripLocalePrefix } from "@/i18n/locale-registry";
import { dataViewPath, isRecordTimelinePath } from "@/core/data-view/data-view-paths";
import { SURFACE, type DataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import { SurfaceKeySchema, ViewKeySchema } from "@/core/data-view/data-view-state.schema";
import { GET_PARAM_KEYS } from "@/core/utils/get-params";

type ViewContext = { surfaceKey: string; viewKey: string };
type Registration = {
  pathname: string;
  viewPathname?: string;
  read: () => ViewContext | null;
  prepare?: () => Promise<void>;
};
export type AgentViewChange = {
  surfaceKey: DataViewSurfaceKey;
  action?: "create" | "update" | "reset" | "select" | "delete";
  viewKey?: string;
};

function isTimelineRecordPath(pathname: string) {
  const path = stripLocalePrefix(pathname);
  return isRecordTimelinePath(path);
}

export class AgentViewContext {
  private registrations: Registration[] = [];

  private get registration(): Registration | undefined {
    return this.registrations.at(-1);
  }

  register(
    pathname: string,
    read: Registration["read"],
    prepare?: Registration["prepare"],
    viewPathname?: string,
  ): () => void {
    const registration = { pathname, read, prepare, viewPathname };
    this.registrations.push(registration);
    return () => {
      this.registrations = this.registrations.filter((entry) => entry !== registration);
    };
  }

  private current(pathname: string, allowViewPathname = false) {
    const owner = this.registration;
    if (!owner || (owner.pathname !== pathname && !(allowViewPathname && owner.viewPathname === pathname))) return null;

    for (let index = this.registrations.length - 1; index >= 0; index -= 1) {
      const registration = this.registrations[index];
      if (registration.pathname !== owner.pathname) break;
      if (registration.pathname !== pathname && !(allowViewPathname && registration.viewPathname === pathname))
        continue;
      const value = registration.read();
      const surface = SurfaceKeySchema.safeParse(value?.surfaceKey);
      const view = ViewKeySchema.safeParse(value?.viewKey);
      if (surface.success && view.success) return { surfaceKey: surface.data, viewKey: view.data, registration };
    }

    return null;
  }

  route(pathname: string): string {
    const view = this.current(pathname);
    if (!view) return pathname;
    const query = new URLSearchParams({
      view: view.viewKey,
      viewSurface: view.surfaceKey,
    });
    return `${view.registration.viewPathname ?? pathname}?${query}`;
  }

  prepare(route: string): Promise<void> | undefined {
    const url = new URL(route, "http://localhost");
    const current = this.current(url.pathname, true);
    if (
      current?.surfaceKey !== url.searchParams.get("viewSurface") ||
      current?.viewKey !== url.searchParams.get("view")
    )
      return;
    return current.registration.prepare?.();
  }

  reloadHref(href: string, changes: readonly AgentViewChange[]): string | null {
    const url = new URL(href);
    const view = this.current(url.pathname);
    if (!view) return null;
    const matching = changes.filter((change) => change.surfaceKey === view.surfaceKey);
    if (!matching.length) return null;
    const ownedPath = dataViewPath(view.surfaceKey);
    const timelineDetail = view.surfaceKey === SURFACE.entityTimeline && isTimelineRecordPath(url.pathname);
    if ((!ownedPath || stripLocalePrefix(url.pathname) !== ownedPath) && !timelineDetail) return null;
    const selectionChanged = matching.some(
      (change) =>
        change.action === "create" ||
        change.action === "select" ||
        (change.action === "delete" && change.viewKey === view.viewKey),
    );
    const currentViewUpdated = matching.some(
      (change) => (change.action === "update" || change.action === "reset") && change.viewKey === view.viewKey,
    );
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
