import { focusHref } from "@/components/focus/focus-href";
import { TOOLBAR_PAGES_WITH_ADD, TOOLBAR_PAGES_WITHOUT_ADD } from "@/ee/agent-chat/ui-anchors";
import { AGENT_UI_TARGETS } from "@/ee/agent-chat/ui-targets";
import { escapeRegExp } from "@/i18n/routing";

export const APP_LINK_SCHEME = "app:";

const APP_LINK_HREF = /\]\(app:([^)\s]*)\)/g;

type ParsedAppLink = { route: string; focus: string | null };

const PAGE_ROUTES = new Set([
  ...AGENT_UI_TARGETS.filter((target) => target.id.startsWith("nav-") && target.route.startsWith("/")).map(
    (target) => target.route,
  ),
  ...[...TOOLBAR_PAGES_WITH_ADD, ...TOOLBAR_PAGES_WITHOUT_ADD].map((page) => page.route),
]);

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

export function appLinkForPlace(place: string, focus: string | null): ParsedAppLink | null {
  const route = `/${place}`;
  if (!PAGE_ROUTES.has(route)) return null;
  if (focus !== null && !pageFocusTargetId(route, focus)) return null;
  return { route, focus };
}

export function parseAppLink(href: string): ParsedAppLink | null {
  if (!href.startsWith(APP_LINK_SCHEME)) return null;
  const [place, query, ...extra] = href.slice(APP_LINK_SCHEME.length).split("?");
  if (extra.length > 0 || !place) return null;
  if (query === undefined) return appLinkForPlace(place, null);
  const focus = /^focus=([a-z0-9-]+)$/.exec(query)?.[1];
  return focus ? appLinkForPlace(place, focus) : null;
}

export function appLinkPath(link: ParsedAppLink): string {
  const targetId = link.focus && pageFocusTargetId(link.route, link.focus);
  return targetId ? focusHref({ kind: "control", id: targetId }) : link.route;
}

export function appLinkHrefs(markdown: string): string[] {
  return [...markdown.matchAll(APP_LINK_HREF)].map((match) => `${APP_LINK_SCHEME}${match[1]}`);
}

function resolveAppLinks(markdown: string, toHref: (link: ParsedAppLink) => string): string {
  return markdown.replace(APP_LINK_HREF, (_match, rest: string) => {
    const link = parseAppLink(`${APP_LINK_SCHEME}${rest}`);
    if (!link) throw new Error(`Unknown app link: ${APP_LINK_SCHEME}${rest}`);
    return `](${toHref(link)})`;
  });
}

export function publicAppLinkHref(href: string): string {
  const link = parseAppLink(href);
  if (!link) throw new Error(`Unknown app link: ${href}`);
  return appLinkPath(link);
}

export function resolvePublicAppLinks(markdown: string, baseUrl = ""): string {
  return resolveAppLinks(markdown, (link) => `${baseUrl}${appLinkPath(link)}`);
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
  if (!url || !PAGE_ROUTES.has(url.pathname)) return null;
  const focusParam = url.search ? onlyParam(url, "focus") : null;
  if (url.search && focusParam === null) return null;
  const place = url.pathname.slice(1);
  if (focusParam === null) return appLinkForPlace(place, null);
  if (!focusParam.startsWith("control:")) return null;
  const targetId = focusParam.slice("control:".length);
  const prefix = pageControlPrefix(url.pathname);
  return appLinkForPlace(place, targetId.startsWith(prefix) ? targetId.slice(prefix.length) : targetId);
}

export function isResolvedAppLinkPath(path: string): boolean {
  const link = appLinkFromPublicPath(path);
  return link !== null && appLinkPath(link) === path;
}

export function localizeAppLinks(text: string, baseUrl: string): string {
  const pattern = new RegExp(`\\]\\(${escapeRegExp(baseUrl)}(/[^)\\s]*)\\)`, "g");
  return text.replace(pattern, (match, path: string) => {
    const link = appLinkFromPublicPath(path);
    return link ? `](${appLinkPath(link)})` : match;
  });
}
