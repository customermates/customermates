import type { BrowserContext, Page } from "@playwright/test";
import type { Client } from "pg";

import { fixtureWorkspaceSlug } from "../../core/config/synthetic-seed-user";
import { SOLUTION_CATALOG, SOLUTION_DATA_LOCALES, findSolution } from "../../core/solutions/solution-catalog";

export const TEAM_WORKSPACE_SLUG = findSolution("smb").workspaceSlugs.en;

export const GERMAN_CONSULTANTS_SLUG = findSolution("consultants").workspaceSlugs.de;

export const TEAM_WORKSPACE_COMPANY_ID = findSolution("smb").companyIds.en;

export const GERMAN_CONSULTANTS_COMPANY_ID = findSolution("consultants").companyIds.de;

export { fixtureWorkspaceSlug };

const SEEDED_SLUGS = new Map(
  SOLUTION_CATALOG.flatMap((solution) =>
    SOLUTION_DATA_LOCALES.map((locale) => [solution.companyIds[locale], solution.workspaceSlugs[locale]] as const),
  ),
);

export function companySlug(companyId: string) {
  return SEEDED_SLUGS.get(companyId) ?? fixtureWorkspaceSlug(companyId);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizedPath(path: string) {
  if (path === "" || path === "/") return "";
  return path.startsWith("/") || path.startsWith("?") || path.startsWith("#") ? path : `/${path}`;
}

export function appPath(slug: string, path: string, locale = "en") {
  return `/${locale}/w/${slug}${normalizedPath(path)}`;
}

export function companyPath(companyId: string, path: string, locale = "en") {
  return appPath(companySlug(companyId), path, locale);
}

export function appApiPath(slug: string, apiPath: string) {
  return `/api/w/${slug}${normalizedPath(apiPath.replace(/^\/api(?=\/)/u, ""))}`;
}

export function appUrlPattern(slug: string, pathRegexSource = "", locale = "en", flags?: string) {
  return new RegExp(`/${escapeRegExp(locale)}/w/${escapeRegExp(slug)}${pathRegexSource}`, flags);
}

export function companyUrlPattern(companyId: string, pathRegexSource = "", locale = "en", flags?: string) {
  return appUrlPattern(companySlug(companyId), pathRegexSource, locale, flags);
}

export const ANY_WORKSPACE_SEGMENT = "/w/[a-z0-9]+(?:-[a-z0-9]+)*";

export function anyWorkspaceUrlPattern(pathRegexSource = "", locale = "en", flags?: string) {
  return new RegExp(`/${escapeRegExp(locale)}${ANY_WORKSPACE_SEGMENT}${pathRegexSource}`, flags);
}

export function slugInUrl(url: string | URL) {
  if (String(url) === "about:blank") return null;
  const pathname = new URL(String(url), "http://localhost").pathname;
  return /^(?:\/[a-z]{2}(?:-[A-Za-z]{2})?)?\/w\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/u.exec(pathname)?.[1] ?? null;
}

export function slugFromUrl(url: string | URL) {
  const slug = slugInUrl(url);
  if (!slug) throw new Error(`The URL ${String(url)} has no workspace segment`);
  return slug;
}

export async function workspaceSlugOf(database: Client, companyId: string) {
  const result = await database.query<{ slug: string }>('SELECT slug FROM "Company" WHERE id=$1', [companyId]);
  const slug = result.rows[0]?.slug;
  if (!slug) throw new Error("The workspace to read the slug of is missing");
  return slug;
}

const contextSlugs = new WeakMap<BrowserContext, string>();

export function rememberWorkspaceSlug(context: BrowserContext, slug: string) {
  contextSlugs.set(context, slug);
}

export function pageSlug(page: Page) {
  const inUrl = slugInUrl(page.url());
  if (inUrl) return inUrl;
  const remembered = contextSlugs.get(page.context());
  if (!remembered) throw new Error("The page has no workspace in its URL and its browser context has no default one");
  return remembered;
}

export function pagePath(page: Page, path: string, locale = "en") {
  return appPath(pageSlug(page), path, locale);
}
