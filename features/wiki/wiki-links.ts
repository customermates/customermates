import { isWorkspaceSlugSegment, workspacePath } from "@/core/navigation/workspace-paths";
import { routingLocaleFromUrlSegment } from "@/i18n/locale-registry";

const UUID_SOURCE =
  "(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)";
const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`, "i");
const WIKI_PATH_PATTERN = new RegExp(String.raw`^/(?:([a-z]{2})/)?(?:w/([^/?#]+)/)?wiki\?page=([^&?#]+)$`);
const WIKI_URL_CANDIDATE_PATTERN = new RegExp(
  `(?:https?:\\/\\/[^\\s)\\]}>"'\u0060]+)?\\/(?:[a-z]{2}\\/)?(?:w\\/[a-z0-9-]+\\/)?wiki\\?[^\\s)\\]}>"'\u0060]+`,
  "giu",
);
const TRAILING_PROSE_PUNCTUATION = /[.,;:!?]+$/u;
const WIKI_HREF_SINGLE_CHARACTER_BOUNDARY = /[\s\u0060"'\[<]/u;

function normalizedBaseUrl(baseUrl: string): URL | null {
  try {
    const parsed = new URL(baseUrl);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

export type WikiPageTarget = { id: string; path: string; slug: string | null };

function exactWikiPathTarget(value: string): WikiPageTarget | null {
  const match = WIKI_PATH_PATTERN.exec(value);
  if (!match?.[3]) return null;
  if (match[1] && !routingLocaleFromUrlSegment(match[1])) return null;
  if (match[2] !== undefined && !isWorkspaceSlugSegment(match[2])) return null;
  if (!UUID_PATTERN.test(match[3])) return null;
  const id = match[3].toLowerCase();
  return { id, path: wikiPagePath(id), slug: match[2] ?? null };
}

export function wikiPagePath(id: string): string {
  if (!UUID_PATTERN.test(id)) throw new Error("Knowledge Base page id must be a UUID.");
  return `/wiki?page=${id.toLowerCase()}`;
}

export function workspaceWikiPagePath(slug: string, id: string): string {
  if (!isWorkspaceSlugSegment(slug)) throw new Error("Workspace slug is invalid.");
  return workspacePath(slug, wikiPagePath(id));
}

export function wikiPageMarkdownLink(title: string, id: string): string {
  return `[${title.replace(/[\\[\]]/g, "\\$&")}](${wikiPagePath(id)})`;
}

export function wikiPageUrl(baseUrl: string, slug: string, id: string): string {
  const base = normalizedBaseUrl(baseUrl);
  if (!base) throw new Error("Knowledge Base base URL must be HTTP(S).");
  return new URL(workspaceWikiPagePath(slug, id), base.origin).toString();
}

export function wikiPageFetchId(id: string): string {
  if (!UUID_PATTERN.test(id)) throw new Error("Knowledge Base page id must be a UUID.");
  return `wiki:${id.toLowerCase()}`;
}

export function isWikiTargetInWorkspace(target: { slug: string | null }, slug: string | null | undefined): boolean {
  return target.slug === null || target.slug === slug;
}

export function parseWikiPageHref(value: string, baseUrl?: string): WikiPageTarget | null {
  if (!value || /[\u0000-\u0020\\]/u.test(value) || value.startsWith("//")) return null;
  const base = baseUrl ? normalizedBaseUrl(baseUrl) : null;

  try {
    const absolute = /^[a-z][a-z0-9+.-]*:/iu.test(value);
    if (absolute && !base) return null;
    if (!absolute) return value.startsWith("/") ? exactWikiPathTarget(value) : null;

    const parsed = new URL(value);
    if (parsed.origin !== base?.origin || parsed.username || parsed.password) return null;
    const originPrefix = `${parsed.protocol}//${parsed.host}`;
    if (!value.startsWith(originPrefix)) return null;
    return exactWikiPathTarget(value.slice(originPrefix.length));
  } catch {
    return null;
  }
}

export function parseWikiPageReference(value: string, baseUrl: string): WikiPageTarget | null {
  const fetchId = /^wiki:([0-9a-f-]+)$/iu.exec(value);
  if (fetchId?.[1] && UUID_PATTERN.test(fetchId[1])) {
    const id = fetchId[1].toLowerCase();
    return { id, path: wikiPagePath(id), slug: null };
  }

  return parseWikiPageHref(value, baseUrl);
}

function hasWikiHrefStartBoundary(value: string, start: number): boolean {
  if (start === 0) return true;
  if (WIKI_HREF_SINGLE_CHARACTER_BOUNDARY.test(value[start - 1] ?? "")) return true;
  return start >= 2 && value.slice(start - 2, start) === "](";
}

export function findWikiPageHrefRanges(
  value: string,
  baseUrl?: string,
): Array<{ start: number; end: number; id: string; slug: string | null }> {
  const ranges: Array<{ start: number; end: number; id: string; slug: string | null }> = [];
  for (const match of value.matchAll(WIKI_URL_CANDIDATE_PATTERN)) {
    const start = match.index;
    if (start === undefined || !hasWikiHrefStartBoundary(value, start)) continue;
    const punctuation = TRAILING_PROSE_PUNCTUATION.exec(match[0])?.[0] ?? "";
    const reference = punctuation ? match[0].slice(0, -punctuation.length) : match[0];
    const target = parseWikiPageHref(reference, baseUrl);
    if (!target) continue;
    ranges.push({ start, end: start + reference.length, id: target.id, slug: target.slug });
  }
  return ranges;
}

export function localizeWikiPageUrls(value: string, baseUrl: string, workspaceSlug?: string | null): string {
  return value.replace(WIKI_URL_CANDIDATE_PATTERN, (candidate) => {
    const punctuation = TRAILING_PROSE_PUNCTUATION.exec(candidate)?.[0] ?? "";
    const reference = punctuation ? candidate.slice(0, -punctuation.length) : candidate;
    const target = parseWikiPageHref(reference, baseUrl);
    return target && isWikiTargetInWorkspace(target, workspaceSlug) ? `${target.path}${punctuation}` : candidate;
  });
}
