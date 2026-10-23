import { buildLocalePath, routingLocaleFromPathname, stripLocalePrefix } from "../../i18n/locale-registry";

export const WORKSPACE_HEADER = "x-cm-workspace";

export const WORKSPACE_PATH_SEGMENT = "w";

export const WORKSPACE_LANDING_PATH = "/dashboard";

export const WORKSPACE_ENTRY_TARGET_PARAM = "open";

export const WORKSPACE_APP_ROOTS = [
  "/configure",
  "/dashboard",
  "/inbox",
  "/onboarding/wizard",
  "/records",
  "/routines",
  "/search",
  "/settings",
  "/subscription-expired",
  "/test",
  "/trash",
  "/wiki",
] as const;

const SLUG_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const INTERNAL_BASE = "https://internal.invalid";

function hasRoot(path: string, root: string): boolean {
  return path === root || path.startsWith(`${root}/`);
}

export function isWorkspaceAppPath(unprefixedPath: string): boolean {
  const path = unprefixedPath.split(/[?#]/u, 1)[0] ?? "";
  return WORKSPACE_APP_ROOTS.some((root) => hasRoot(path, root));
}

export function isWorkspaceSlugSegment(value: string | undefined | null): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 40 && SLUG_SEGMENT.test(value);
}

export type WorkspacePathParts = { slug: string; path: string };

export function splitWorkspacePath(unprefixedPath: string): WorkspacePathParts | null {
  const segments = unprefixedPath.split("/");
  if (segments[1] !== WORKSPACE_PATH_SEGMENT) return null;

  const slug = segments[2];
  if (!isWorkspaceSlugSegment(slug)) return null;

  const rest = segments.slice(3).join("/");
  return { slug, path: rest ? `/${rest}` : "/" };
}

export function workspaceSlugFromPathname(pathname: string): string | null {
  return splitWorkspacePath(stripLocalePrefix(pathname))?.slug ?? null;
}

export function workspaceSlugFromApiPathname(pathname: string): string | null {
  const match = /^\/api\/w\/([^/]+)(?:\/|$)/u.exec(pathname);
  return match && isWorkspaceSlugSegment(match[1]) ? match[1] : null;
}

export function stripWorkspaceApiPrefix(pathname: string, slug: string): string {
  const prefix = `/api/${WORKSPACE_PATH_SEGMENT}/${slug}`;
  return pathname.startsWith(prefix) ? `/api${pathname.slice(prefix.length)}` : pathname;
}

export function stripWorkspacePrefix(pathname: string): string {
  const locale = routingLocaleFromPathname(pathname);
  const unprefixed = stripLocalePrefix(pathname);
  const parts = splitWorkspacePath(unprefixed);
  if (!parts) return pathname;

  return locale ? buildLocalePath(locale, parts.path) : parts.path;
}

export function workspacePath(slug: string, unprefixedPath: string): string {
  const path = unprefixedPath.startsWith("/") ? unprefixedPath : `/${unprefixedPath}`;
  return path === "/" ? `/${WORKSPACE_PATH_SEGMENT}/${slug}` : `/${WORKSPACE_PATH_SEGMENT}/${slug}${path}`;
}

export function workspaceLocalePath(locale: string, slug: string, unprefixedPath: string): string {
  return buildLocalePath(locale, workspacePath(slug, unprefixedPath));
}

export function workspaceApiPath(slug: string, apiPath: string): string {
  const path = apiPath.replace(/^\/api(?=\/)/u, "");
  return `/api/${WORKSPACE_PATH_SEGMENT}/${slug}${path.startsWith("/") ? path : `/${path}`}`;
}

export function withWorkspaceHref(href: string, slug: string | null | undefined): string {
  if (!slug || !href.startsWith("/") || href.startsWith("//")) return href;

  const target = new URL(href, INTERNAL_BASE);
  const locale = routingLocaleFromPathname(target.pathname);
  const unprefixed = stripLocalePrefix(target.pathname);
  if (splitWorkspacePath(unprefixed) || !isWorkspaceAppPath(unprefixed)) return href;

  const qualified = workspacePath(slug, unprefixed);
  const pathname = locale ? buildLocalePath(locale, qualified) : qualified;
  return `${pathname}${target.search}${target.hash}`;
}

export function absoluteWorkspaceUrl(
  baseUrl: string,
  locale: string | null,
  slug: string,
  unprefixedPath: string,
): string {
  const qualified = workspacePath(slug, unprefixedPath);
  const path = locale ? buildLocalePath(locale, qualified) : qualified;
  return `${baseUrl.replace(/\/+$/u, "")}${path}`;
}

export function workspaceEntryHref(unprefixedPath: string): string {
  return `${WORKSPACE_LANDING_PATH}?${WORKSPACE_ENTRY_TARGET_PARAM}=${encodeURIComponent(unprefixedPath)}`;
}

export function workspaceEntryTarget(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return WORKSPACE_LANDING_PATH;
  return isWorkspaceAppPath(value) ? value : WORKSPACE_LANDING_PATH;
}
