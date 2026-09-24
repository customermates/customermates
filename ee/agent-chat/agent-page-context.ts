import { z } from "zod";

import { SurfaceKeySchema, ViewKeySchema } from "@/core/data-view/data-view-identity.schema";
import { SURFACE, type DataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import { DATA_VIEW_PATHS, ENTITY_TIMELINE_PARENT_PATHS } from "@/core/data-view/data-view-paths";
import { stripLocalePrefix } from "@/i18n/locale-registry";

const CONTEXT_ORIGIN = "https://local.invalid";

function contextRoute(pageRoute: string | null | undefined): URL | null {
  if (!pageRoute) return null;
  try {
    return new URL(pageRoute, CONTEXT_ORIGIN);
  } catch {
    return null;
  }
}

function routeMatchesSurface(route: URL, surfaceKey: DataViewSurfaceKey): boolean {
  const path = stripLocalePrefix(route.pathname);
  if (surfaceKey !== SURFACE.entityTimeline) return DATA_VIEW_PATHS[surfaceKey] === path;

  const parent = ENTITY_TIMELINE_PARENT_PATHS.find((candidate) => path.startsWith(`${candidate}/`));
  if (!parent) return false;
  return z.uuid().safeParse(path.slice(parent.length + 1)).success;
}

export function agentViewRequestTarget(pageRoute: string | null | undefined) {
  const route = contextRoute(pageRoute);
  if (!route?.searchParams.has("viewAction")) return { kind: "ordinary" as const };
  const query = route.searchParams;
  if (
    !pageRoute?.startsWith("/") ||
    pageRoute.startsWith("//") ||
    route.origin !== CONTEXT_ORIGIN ||
    ["viewAction", "viewSurface", "view"].some((key) => query.getAll(key).length !== 1)
  )
    return { kind: "invalid" as const };
  const action = query.get("viewAction");
  const surface = SurfaceKeySchema.safeParse(query.get("viewSurface"));
  const view = ViewKeySchema.safeParse(query.get("view"));
  if (
    !surface.success ||
    !view.success ||
    !routeMatchesSurface(route, surface.data) ||
    (action !== "create" && action !== "update")
  )
    return { kind: "invalid" as const };
  return { kind: "target" as const, action, surfaceKey: surface.data, viewKey: view.data };
}

export function agentViewRequestMismatch(pageRoute: string | null | undefined, input: unknown): string | null {
  const target = agentViewRequestTarget(pageRoute);
  if (target.kind === "ordinary" || !input || typeof input !== "object") return null;
  const request = input as Record<string, unknown>;
  if (request.action === "surfaces" || request.action === "list" || request.action === "config") return null;
  if (target.kind === "invalid")
    return "The Ask AI request has invalid view context. No change was made. Ask the user to reopen Ask AI from the intended view.";
  if (
    request.surfaceKey === target.surfaceKey &&
    request.action === target.action &&
    (target.action === "create" || request.viewKey === target.viewKey)
  )
    return null;
  return `This Ask AI request targets action=${target.action}, surfaceKey=${target.surfaceKey}, viewKey=${target.viewKey}. No change was made. Correct the tool arguments to match this target; linked records mentioned in a filter do not change the target page.`;
}

export function agentViewToolMismatch(
  pageRoute: string | null | undefined,
  toolName: string,
  input: unknown,
): string | null {
  if (toolName === "manage_data_views") return agentViewRequestMismatch(pageRoute, input);
  if (toolName !== "manage_custom_columns" || !input || typeof input !== "object") return null;

  const action = (input as Record<string, unknown>).action;
  if (action !== "upsert" && action !== "delete") return null;

  const target = agentViewRequestTarget(pageRoute);
  if (target.kind === "ordinary") return null;
  if (target.kind === "invalid")
    return "The Ask AI request has invalid view context. No change was made. Ask the user to reopen Ask AI from the intended view.";

  return "This Ask AI request is scoped to a saved view. Creating, updating, or deleting a custom field is outside that request, so no change was made. Use only filter fields returned by manage_data_views config; if the requested field is absent, report that it is unavailable and leave the view unchanged.";
}

function escapeAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export function agentPageContextPrefix(pageRoute: string | null): string {
  if (!pageRoute) return "";
  const attributes: Record<string, string> = { route: pageRoute };
  if (pageRoute.startsWith("/") && !pageRoute.startsWith("//")) {
    const query = contextRoute(pageRoute)?.searchParams;
    const surface = SurfaceKeySchema.safeParse(query?.get("viewSurface"));
    const view = ViewKeySchema.safeParse(query?.get("view"));
    const route = contextRoute(pageRoute);
    if (surface.success && view.success && route && routeMatchesSurface(route, surface.data)) {
      attributes.surfaceKey = surface.data;
      attributes.viewKey = view.data;
      const requestTarget = agentViewRequestTarget(pageRoute);
      if (requestTarget.kind === "target") attributes.requestedAction = requestTarget.action;
    }
  }
  return `<page_context ${Object.entries(attributes)
    .map(([key, value]) => `${key}="${escapeAttribute(value)}"`)
    .join(" ")}/>\n`;
}
