import type { PublicWikiHomepage } from "@/features/wiki/wiki-homepage";

import { parsePublicPageUrl } from "@/features/wiki/wiki-homepage";

export const MAX_PUBLIC_PAGE_ATTEMPTS = 5;

export type PublicPageReadState = {
  homepageUrl: string;
  registrableDomain: string;
  attemptedUrls: string[];
  linkedUrls: string[];
};

export function createPublicPageReadState(homepage: PublicWikiHomepage): PublicPageReadState {
  return {
    homepageUrl: homepage.url,
    registrableDomain: homepage.registrableDomain,
    attemptedUrls: [],
    linkedUrls: [],
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
  if (!result.ok || requestedUrl !== state.homepageUrl || !state.attemptedUrls.includes(state.homepageUrl)) return;

  state.linkedUrls = [
    ...new Set(
      result.links.flatMap((link) => {
        const page = parsePublicPageUrl(link.url);
        return page?.registrableDomain === state.registrableDomain && page.url !== result.url ? [page.url] : [];
      }),
    ),
  ];
}
