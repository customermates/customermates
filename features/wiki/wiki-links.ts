import { routingLocaleFromUrlSegment } from "@/i18n/locale-registry";

const UUID_SOURCE =
  "(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)";
const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`, "i");
const WIKI_PATH_PATTERN = new RegExp(String.raw`^/(?:([a-z]{2})/)?wiki\?page=([^&?#]+)$`);
const WIKI_URL_CANDIDATE_PATTERN = new RegExp(
  `(?:https?:\\/\\/[^\\s)\\]}>"'\u0060]+)?\\/(?:[a-z]{2}\\/)?wiki\\?[^\\s)\\]}>"'\u0060]+`,
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

function exactWikiPathId(value: string): string | null {
  const match = WIKI_PATH_PATTERN.exec(value);
  if (!match?.[2]) return null;
  if (match[1] && !routingLocaleFromUrlSegment(match[1])) return null;
  if (!UUID_PATTERN.test(match[2])) return null;
  return match[2].toLowerCase();
}

export function wikiPagePath(id: string): string {
  if (!UUID_PATTERN.test(id)) throw new Error("Wiki page id must be a UUID.");
  return `/wiki?page=${id.toLowerCase()}`;
}

export function wikiPageUrl(baseUrl: string, id: string): string {
  const base = normalizedBaseUrl(baseUrl);
  if (!base) throw new Error("Wiki base URL must be HTTP(S).");
  return new URL(wikiPagePath(id), base.origin).toString();
}

export function wikiPageFetchId(id: string): string {
  if (!UUID_PATTERN.test(id)) throw new Error("Wiki page id must be a UUID.");
  return `wiki:${id.toLowerCase()}`;
}

export function parseWikiPageHref(value: string, baseUrl?: string): { id: string; path: string } | null {
  if (!value || /[\u0000-\u0020\\]/u.test(value) || value.startsWith("//")) return null;
  const base = baseUrl ? normalizedBaseUrl(baseUrl) : null;

  try {
    const absolute = /^[a-z][a-z0-9+.-]*:/iu.test(value);
    if (absolute && !base) return null;
    if (!absolute) {
      if (!value.startsWith("/")) return null;
      const id = exactWikiPathId(value);
      return id ? { id, path: wikiPagePath(id) } : null;
    }

    const parsed = new URL(value);
    if (parsed.origin !== base?.origin || parsed.username || parsed.password) return null;
    const originPrefix = `${parsed.protocol}//${parsed.host}`;
    if (!value.startsWith(originPrefix)) return null;
    const id = exactWikiPathId(value.slice(originPrefix.length));
    return id ? { id, path: wikiPagePath(id) } : null;
  } catch {
    return null;
  }
}

export function parseWikiPageReference(value: string, baseUrl: string): { id: string; path: string } | null {
  const fetchId = /^wiki:([0-9a-f-]+)$/iu.exec(value);
  if (fetchId?.[1] && UUID_PATTERN.test(fetchId[1])) {
    const id = fetchId[1].toLowerCase();
    return { id, path: wikiPagePath(id) };
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
): Array<{ start: number; end: number; id: string }> {
  const ranges: Array<{ start: number; end: number; id: string }> = [];
  for (const match of value.matchAll(WIKI_URL_CANDIDATE_PATTERN)) {
    const start = match.index;
    if (start === undefined || !hasWikiHrefStartBoundary(value, start)) continue;
    const punctuation = TRAILING_PROSE_PUNCTUATION.exec(match[0])?.[0] ?? "";
    const reference = punctuation ? match[0].slice(0, -punctuation.length) : match[0];
    const target = parseWikiPageHref(reference, baseUrl);
    if (!target) continue;
    ranges.push({ start, end: start + reference.length, id: target.id });
  }
  return ranges;
}

export function localizeWikiPageUrls(value: string, baseUrl: string): string {
  return value.replace(WIKI_URL_CANDIDATE_PATTERN, (candidate) => {
    const punctuation = TRAILING_PROSE_PUNCTUATION.exec(candidate)?.[0] ?? "";
    const reference = punctuation ? candidate.slice(0, -punctuation.length) : candidate;
    const target = parseWikiPageHref(reference, baseUrl);
    return target ? `${target.path}${punctuation}` : candidate;
  });
}
