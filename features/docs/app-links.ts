import { z } from "zod";

import { focusHref } from "@/components/focus/focus-href";
import { RECORD_LIST_CONTROLS } from "@/ee/agent-chat/record-ui-targets";
import { AGENT_UI_TARGETS } from "@/ee/agent-chat/ui-targets";
import { RECORD_PRESET_KEYS, type RecordPresetKey } from "@/features/records/record-navigation.schema";
import { escapeRegExp } from "@/i18n/routing";

export const APP_LINK_SCHEME = "app:";
export const APP_LINK_OPEN_ROUTE = "/open";

const APP_LINK_HREF = /\]\(app:([^)\s]*)\)/g;
const LIST_AREAS = ["records", "configure"] as const;

type ListArea = (typeof LIST_AREAS)[number];

export type ParsedAppLink =
  | { kind: "page"; place: string; route: string; focus: string | null }
  | { kind: ListArea; place: string; preset: RecordPresetKey; focus: string | null };

export type AppLinkWorkspace = { listId: (preset: RecordPresetKey) => string };

const PAGE_ROUTES = new Set(
  AGENT_UI_TARGETS.filter((target) => target.id.startsWith("nav-") && target.route.startsWith("/")).map(
    (target) => target.route,
  ),
);

function pageControlPrefix(route: string) {
  return `${route.slice(1).replaceAll("/", "-")}-`;
}

function pageFocusTargetId(route: string, focus: string): string | null {
  const prefix = pageControlPrefix(route);
  const target = AGENT_UI_TARGETS.find(
    (candidate) =>
      candidate.route === route &&
      !candidate.prerequisite &&
      !candidate.id.startsWith("nav-") &&
      (candidate.id === `${prefix}${focus}` || candidate.id === focus),
  );
  return target?.id ?? null;
}

const LIST_FOCUS: Record<ListArea, readonly string[]> = {
  records: RECORD_LIST_CONTROLS.filter((control) => !control.startsWith("layout-")),
  configure: [],
};

function isPreset(value: string): value is RecordPresetKey {
  return (RECORD_PRESET_KEYS as readonly string[]).includes(value);
}

function isListArea(value: string): value is ListArea {
  return (LIST_AREAS as readonly string[]).includes(value);
}

export function appLinkForPlace(place: string, focus: string | null): ParsedAppLink | null {
  const route = `/${place}`;
  if (PAGE_ROUTES.has(route)) {
    if (focus !== null && !pageFocusTargetId(route, focus)) return null;
    return { kind: "page", place, route, focus };
  }
  const [area, preset, ...rest] = place.split("/");
  if (rest.length > 0 || !isListArea(area) || !preset || !isPreset(preset)) return null;
  if (focus !== null && !LIST_FOCUS[area].includes(focus)) return null;
  return { kind: area, place, preset, focus };
}

export function parseAppLink(href: string): ParsedAppLink | null {
  if (!href.startsWith(APP_LINK_SCHEME)) return null;
  const [place, query, ...extra] = href.slice(APP_LINK_SCHEME.length).split("?");
  if (extra.length > 0 || !place) return null;
  if (query === undefined) return appLinkForPlace(place, null);
  const focus = /^focus=([a-z0-9-]+)$/.exec(query)?.[1];
  return focus ? appLinkForPlace(place, focus) : null;
}

export function appLinkPath(link: ParsedAppLink, workspace: AppLinkWorkspace | null): string {
  if (link.kind === "page") {
    const targetId = link.focus && pageFocusTargetId(link.route, link.focus);
    return targetId ? focusHref({ kind: "control", id: targetId }) : link.route;
  }

  const openPath = `${APP_LINK_OPEN_ROUTE}/${link.place}`;
  if (!workspace) return link.focus ? `${openPath}?focus=${link.focus}` : openPath;
  const typeId = workspace.listId(link.preset);
  if (link.kind === "configure") return focusHref({ kind: "list", id: typeId });
  return link.focus ? focusHref({ kind: "control", id: `records:${typeId}:${link.focus}` }) : `/records/${typeId}`;
}

export function appLinkHrefs(markdown: string): string[] {
  return [...markdown.matchAll(APP_LINK_HREF)].map((match) => `${APP_LINK_SCHEME}${match[1]}`);
}

export function resolveAppLinks(markdown: string, toHref: (link: ParsedAppLink) => string): string {
  return markdown.replace(APP_LINK_HREF, (_match, rest: string) => {
    const link = parseAppLink(`${APP_LINK_SCHEME}${rest}`);
    if (!link) throw new Error(`Unknown app link: ${APP_LINK_SCHEME}${rest}`);
    return `](${toHref(link)})`;
  });
}

export function publicAppLinkHref(href: string): string {
  const link = parseAppLink(href);
  if (!link) throw new Error(`Unknown app link: ${href}`);
  return appLinkPath(link, null);
}

export function resolvePublicAppLinks(markdown: string, baseUrl = ""): string {
  return resolveAppLinks(markdown, (link) => `${baseUrl}${appLinkPath(link, null)}`);
}

const LINK_BASE = "https://app-link.invalid";

function relativeUrl(path: string): URL | null {
  const url = new URL(path, LINK_BASE);
  return url.origin === LINK_BASE && !url.hash && `${url.pathname}${url.search}` === path ? url : null;
}

function onlyParam(url: URL, name: string) {
  const keys = [...url.searchParams.keys()];
  return keys.length === 1 && keys[0] === name ? url.searchParams.get(name) : null;
}

function appLinkFromPublicPath(path: string): ParsedAppLink | null {
  const url = relativeUrl(path);
  if (!url) return null;
  const focusParam = url.search ? onlyParam(url, "focus") : null;
  if (url.search && focusParam === null) return null;
  const place = url.pathname.slice(1);
  if (url.pathname.startsWith(`${APP_LINK_OPEN_ROUTE}/`))
    return appLinkForPlace(place.slice(APP_LINK_OPEN_ROUTE.length), focusParam);
  if (!PAGE_ROUTES.has(url.pathname)) return null;
  if (focusParam === null) return appLinkForPlace(place, null);
  if (!focusParam.startsWith("control:")) return null;
  const targetId = focusParam.slice("control:".length);
  const prefix = pageControlPrefix(url.pathname);
  return appLinkForPlace(place, targetId.startsWith(prefix) ? targetId.slice(prefix.length) : targetId);
}

function isResolvedListPath(path: string): boolean {
  const url = relativeUrl(path);
  if (!url) return false;
  if (url.pathname === "/configure") {
    const focus = onlyParam(url, "focus");
    return Boolean(focus?.startsWith("list:")) && z.uuid().safeParse(focus.slice("list:".length)).success;
  }
  const [, area, typeId, ...rest] = url.pathname.split("/");
  if (area !== "records" || rest.length > 0 || !z.uuid().safeParse(typeId).success) return false;
  if (!url.search) return true;
  const focus = onlyParam(url, "focus");
  return LIST_FOCUS.records.some((control) => focus === `control:records:${typeId}:${control}`);
}

export function isResolvedAppLinkPath(path: string): boolean {
  if (isResolvedListPath(path)) return true;
  const link = appLinkFromPublicPath(path);
  return link?.kind === "page" && appLinkPath(link, null) === path;
}

export function localizeAppLinks(text: string, baseUrl: string, workspace: AppLinkWorkspace): string {
  const pattern = new RegExp(`\\]\\(${escapeRegExp(baseUrl)}(/[^)\\s]*)\\)`, "g");
  return text.replace(pattern, (match, path: string) => {
    const link = appLinkFromPublicPath(path);
    return link ? `](${appLinkPath(link, workspace)})` : match;
  });
}
