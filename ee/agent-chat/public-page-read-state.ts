import type { PublicWikiHomepage } from "@/features/wiki/wiki-homepage";

import { parsePublicPageUrl } from "@/features/wiki/wiki-homepage";

export const MAX_PUBLIC_PAGE_ATTEMPTS = 4;

export type PublicPageReadState = {
  homepageUrl: string;
  registrableDomain: string;
  attemptedUrls: string[];
  settledUrls: string[];
  successfulUrls: string[];
  linkedUrls: string[];
  homepageSucceeded: boolean;
};

export function createPublicPageReadState(homepage: PublicWikiHomepage): PublicPageReadState {
  return {
    homepageUrl: homepage.url,
    registrableDomain: homepage.registrableDomain,
    attemptedUrls: [],
    settledUrls: [],
    successfulUrls: [],
    linkedUrls: [],
    homepageSucceeded: false,
  };
}

export function reservePublicPageRead(
  state: PublicPageReadState,
  value: string,
):
  | { ok: true; url: string; allowedDomain: string }
  | {
      ok: false;
      reason: "invalid_url" | "outside_domain" | "not_linked" | "already_attempted" | "page_limit";
    } {
  const page = parsePublicPageUrl(value);
  if (!page) return { ok: false, reason: "invalid_url" };
  if (page.registrableDomain !== state.registrableDomain) return { ok: false, reason: "outside_domain" };
  if (state.attemptedUrls.includes(page.url)) return { ok: false, reason: "already_attempted" };
  if (state.attemptedUrls.length >= MAX_PUBLIC_PAGE_ATTEMPTS) return { ok: false, reason: "page_limit" };
  if (page.url !== state.homepageUrl && !state.linkedUrls.includes(page.url))
    return { ok: false, reason: "not_linked" };

  state.attemptedUrls.push(page.url);
  return { ok: true, url: page.url, allowedDomain: state.registrableDomain };
}

export function recordPublicPageLinks(
  state: PublicPageReadState,
  requestedUrl: string,
  result: { ok: true; url: string; links: { url: string }[] } | { ok: false },
): void {
  state.settledUrls = [...new Set([...(state.settledUrls ?? []), requestedUrl])];
  if (!result.ok) return;

  if (requestedUrl === state.homepageUrl) state.homepageSucceeded = true;

  const successful = parsePublicPageUrl(result.url);
  if (successful?.registrableDomain === state.registrableDomain)
    state.successfulUrls = [...new Set([...state.successfulUrls, successful.url])];

  if (requestedUrl !== state.homepageUrl || !state.attemptedUrls.includes(state.homepageUrl)) return;

  state.linkedUrls = [
    ...new Set(
      result.links.flatMap((link) => {
        const page = parsePublicPageUrl(link.url);
        return page?.registrableDomain === state.registrableDomain &&
          page.url !== result.url &&
          !state.attemptedUrls.includes(page.url)
          ? [page.url]
          : [];
      }),
    ),
  ];
}

export function publicPageResearchProgress(state: PublicPageReadState): {
  complete: boolean;
  remaining: number;
} {
  const requiredFollowUps = Math.min(MAX_PUBLIC_PAGE_ATTEMPTS - 1, state.linkedUrls.length);
  const settledFollowUps = (state.settledUrls ?? []).filter((url) => url !== state.homepageUrl).length;
  const remaining = Math.max(0, requiredFollowUps - settledFollowUps);
  return { complete: state.homepageSucceeded === true && remaining === 0, remaining };
}

export function normalizePublicPageSources(
  state: PublicPageReadState,
  input: unknown,
): { ok: true; input: Record<string, unknown> } | { ok: false } {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false };
  const pages = (input as { pages?: unknown }).pages;
  if (!Array.isArray(pages) || pages.length === 0) return { ok: false };

  const normalizedPages: Record<string, unknown>[] = [];
  for (const page of pages) {
    if (!page || typeof page !== "object" || Array.isArray(page)) return { ok: false };
    const pageInput = page as Record<string, unknown>;
    const sources = pageInput.sources;
    const sections = pageInput.sections;
    if (!Array.isArray(sources)) return { ok: false };
    if (sources.length === 0) {
      if (!Array.isArray(sections) || sections.length > 0) return { ok: false };
      normalizedPages.push({ ...pageInput, sources: [] });
      continue;
    }
    if (!Array.isArray(sections) || sections.length === 0) return { ok: false };

    const normalizedSources: string[] = [];
    for (const source of sources) {
      if (typeof source !== "string") return { ok: false };
      const parsed = parsePublicPageUrl(source);
      if (!parsed) return { ok: false };
      const recorded = state.successfulUrls.find((successfulUrl) => {
        const successful = parsePublicPageUrl(successfulUrl);
        return (
          successful?.registrableDomain === state.registrableDomain &&
          successful.url === successfulUrl &&
          successfulUrl === parsed.url
        );
      });
      if (!recorded) return { ok: false };
      if (!normalizedSources.includes(recorded)) normalizedSources.push(recorded);
    }
    normalizedPages.push({ ...pageInput, sources: normalizedSources });
  }

  return {
    ok: true,
    input: { ...(input as Record<string, unknown>), pages: normalizedPages },
  };
}
