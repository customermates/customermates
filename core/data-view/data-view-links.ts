import { z } from "zod";

import { APP_LOCALES, stripLocalePrefix } from "@/i18n/locale-registry";

import { AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS } from "./ai-manageable-surfaces";
import { ViewKeySchema } from "./data-view-identity.schema";
import { SURFACE } from "./data-view-keys";
import { DATA_VIEW_PATHS, ENTITY_TIMELINE_PARENT_PATHS } from "./data-view-paths";

const STANDALONE_DATA_VIEW_PATHS = new Set(
  AI_MANAGEABLE_DATA_VIEW_SURFACE_KEYS.map((surfaceKey) => DATA_VIEW_PATHS[surfaceKey]).filter(
    (path): path is string => path !== null,
  ),
);
const RECORD_ID_SCHEMA = z.uuid();

type DataViewNavigationOptions = {
  origin?: string;
};

export type DataViewNavigationRange = {
  start: number;
  end: number;
  href: string;
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

const DATA_VIEW_URL_TOKEN_PATTERN = /(?:https?:\/\/|\/)[^\s()[\]<>{}"'`]+/gu;
const TRAILING_SENTENCE_PUNCTUATION = /[!,.:;?]+$/u;

export function dataViewNavigationRanges(
  value: string,
  options: DataViewNavigationOptions = {},
): DataViewNavigationRange[] {
  const ranges: DataViewNavigationRange[] = [];

  for (const match of value.matchAll(DATA_VIEW_URL_TOKEN_PATTERN)) {
    const start = match.index;
    if (start === undefined) continue;
    const previous = value[start - 1];
    if (previous && /[\p{L}\p{N}_:/\\]/u.test(previous)) continue;
    if (previous && /[([<"'`]/u.test(previous) && start > 1 && !/\s/u.test(value[start - 2] ?? "")) continue;
    const candidate = match[0];
    const trailingLength = candidate.match(TRAILING_SENTENCE_PUNCTUATION)?.[0].length ?? 0;
    const token = trailingLength ? candidate.slice(0, -trailingLength) : candidate;
    const href = dataViewNavigationHref(token, options);
    if (href) ranges.push({ start, end: start + token.length, href });
  }

  return ranges;
}

export function entityTimelineNavigationHref(pageRoute: unknown, viewKey: unknown): string | null {
  if (typeof pageRoute !== "string" || !pageRoute.startsWith("/") || pageRoute.startsWith("//")) return null;
  const parsedViewKey = ViewKeySchema.safeParse(viewKey);
  if (!parsedViewKey.success) return null;

  const route = new URL(pageRoute, LOCAL_ROUTE_ORIGIN);
  if (route.origin !== LOCAL_ROUTE_ORIGIN || route.hash) return null;
  return dataViewNavigationHref(`${route.pathname}?view=${parsedViewKey.data}&viewSurface=${SURFACE.entityTimeline}`);
}
