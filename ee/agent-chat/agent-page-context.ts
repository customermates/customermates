import { SurfaceKeySchema, ViewKeySchema } from "@/core/data-view/data-view-identity.schema";

const CONTEXT_ORIGIN = "https://local.invalid";

function contextRoute(pageRoute: string | null | undefined): URL | null {
  if (!pageRoute) return null;
  try {
    return new URL(pageRoute, CONTEXT_ORIGIN);
  } catch {
    return null;
  }
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
  if (!surface.success || !view.success || (action !== "create" && action !== "update"))
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
    if (surface.success && view.success) {
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
