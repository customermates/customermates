import { parse as parseDomain } from "tldts";

export type PublicWikiHomepage = {
  url: string;
  registrableDomain: string;
};

export const WIKI_HOMEPAGE_TOPICS = [
  "company_overview",
  "products_services",
  "customers_competitors",
  "voice_tone",
  "support_faq",
] as const;
export type WikiHomepageTopic = (typeof WIKI_HOMEPAGE_TOPICS)[number];

export function parsePublicDomainName(value: string): string | null {
  const canonical = value.trim().toLowerCase();
  const parsed = parseDomain(canonical, { allowPrivateDomains: true });
  return parsed.domain === canonical && (parsed.isIcann === true || parsed.isPrivate === true) ? canonical : null;
}

function parsePublicUrl(value: string, preserveQuery: boolean): PublicWikiHomepage | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_000 || /[\u0000-\u0020\u007F\\]/.test(trimmed)) return null;
  const candidate = trimmed && !trimmed.includes("://") ? `https://${trimmed}` : trimmed;

  try {
    const homepage = new URL(candidate);
    if (!(["http:", "https:"] as const).includes(homepage.protocol as "http:" | "https:")) return null;
    if (homepage.username || homepage.password || homepage.port) return null;
    if (homepage.protocol === "http:") homepage.protocol = "https:";

    if (homepage.hostname.endsWith(".")) homepage.hostname = homepage.hostname.slice(0, -1);

    const parsed = parseDomain(homepage.hostname, {
      allowPrivateDomains: true,
    });
    const registrableDomain = parsed.domain ? parsePublicDomainName(parsed.domain) : null;
    if (!registrableDomain) return null;

    homepage.hash = "";
    if (!preserveQuery) homepage.search = "";
    if (!homepage.pathname) homepage.pathname = "/";

    const url = homepage.toString();
    return url.length <= 2_000 ? { url, registrableDomain } : null;
  } catch {
    return null;
  }
}

export function parsePublicWikiHomepage(value: string): PublicWikiHomepage | null {
  return parsePublicUrl(value, false);
}

export function parsePublicPageUrl(value: string): PublicWikiHomepage | null {
  return parsePublicUrl(value, true);
}
