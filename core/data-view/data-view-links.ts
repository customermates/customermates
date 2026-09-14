import { z } from "zod";

import { APP_LOCALES, stripLocalePrefix } from "@/i18n/locale-registry";

import { ViewKeySchema } from "./data-view-identity.schema";
import { SURFACE } from "./data-view-keys";
import { DATA_VIEW_PATHS, ENTITY_TIMELINE_PARENT_PATHS } from "./data-view-paths";

const STANDALONE_DATA_VIEW_PATHS = new Set(
  Object.values(DATA_VIEW_PATHS).filter((path): path is string => path !== null),
);
const RECORD_ID_SCHEMA = z.uuid();

type DataViewNavigationOptions = {
  origin?: string;
};

const LOCAL_ROUTE_ORIGIN = "https://local.invalid";

function isCanonicalLocalPath(pathname: string, path: string) {
  return pathname === path || APP_LOCALES.some((locale) => pathname === `/${locale}${path}`);
}

function relativeNavigationCandidate(href: string, options: DataViewNavigationOptions): string | null {
  if (href.startsWith("/")) return href;
  if (!options.origin) return null;

  try {
    const target = new URL(href);
    if (target.origin !== new URL(options.origin).origin || target.username || target.password || target.hash)
      return null;
    return `${target.pathname}${target.search}`;
  } catch {
    return null;
  }
}

export function dataViewNavigationHref(href: unknown, options: DataViewNavigationOptions = {}): string | null {
  if (typeof href !== "string") return null;
  const candidate = relativeNavigationCandidate(href, options);
  if (!candidate) return null;
  const separator = candidate.indexOf("?");
  if (separator < 0) return null;
  const pathname = candidate.slice(0, separator);
  const path = stripLocalePrefix(pathname);
  const query = candidate.slice(separator + 1);

  if (STANDALONE_DATA_VIEW_PATHS.has(path)) {
    if (!isCanonicalLocalPath(pathname, path) || !query.startsWith("view=")) return null;
    const viewKey = query.slice("view=".length);
    if (!ViewKeySchema.safeParse(viewKey).success) return null;
    return `${path}?view=${viewKey}`;
  }

  const timelineSuffix = `&viewSurface=${SURFACE.entityTimeline}`;
  if (!query.endsWith(timelineSuffix)) return null;
  const viewQuery = query.slice(0, -timelineSuffix.length);
  if (!viewQuery.startsWith("view=")) return null;
  const viewKey = viewQuery.slice("view=".length);
  if (!ViewKeySchema.safeParse(viewKey).success) return null;

  const parentPath = ENTITY_TIMELINE_PARENT_PATHS.find((candidate) => path.startsWith(`${candidate}/`));
  if (!parentPath || !isCanonicalLocalPath(pathname, path)) return null;
  const recordId = path.slice(parentPath.length + 1);
  if (!RECORD_ID_SCHEMA.safeParse(recordId).success) return null;
  return `${path}?view=${viewKey}${timelineSuffix}`;
}

export function entityTimelineNavigationHref(pageRoute: unknown, viewKey: unknown): string | null {
  if (typeof pageRoute !== "string" || !pageRoute.startsWith("/") || pageRoute.startsWith("//")) return null;
  const parsedViewKey = ViewKeySchema.safeParse(viewKey);
  if (!parsedViewKey.success) return null;

  const route = new URL(pageRoute, LOCAL_ROUTE_ORIGIN);
  if (route.origin !== LOCAL_ROUTE_ORIGIN || route.hash) return null;
  return dataViewNavigationHref(`${route.pathname}?view=${parsedViewKey.data}&viewSurface=${SURFACE.entityTimeline}`);
}
