import { parse as parseDomain } from "tldts";

export type PublicWikiHomepage = {
  url: string;
  registrableDomain: string;
};

export function parsePublicDomainName(value: string): string | null {
  const canonical = value.trim().toLowerCase();
  const parsed = parseDomain(canonical, { allowPrivateDomains: true });
  return parsed.domain === canonical && (parsed.isIcann === true || parsed.isPrivate === true) ? canonical : null;
}

export function parsePublicWikiHomepage(value: string): PublicWikiHomepage | null {
  const trimmed = value.trim();
  const candidate = trimmed && !trimmed.includes("://") ? `https://${trimmed}` : trimmed;

  try {
    const homepage = new URL(candidate);
    if (!(["http:", "https:"] as const).includes(homepage.protocol as "http:" | "https:")) return null;
    if (homepage.username || homepage.password || homepage.port) return null;

    if (homepage.hostname.endsWith(".")) homepage.hostname = homepage.hostname.slice(0, -1);

    const parsed = parseDomain(homepage.hostname, {
      allowPrivateDomains: true,
    });
    const registrableDomain = parsed.domain ? parsePublicDomainName(parsed.domain) : null;
    if (!registrableDomain) return null;

    homepage.hash = "";
    homepage.search = "";
    if (!homepage.pathname) homepage.pathname = "/";

    return { url: homepage.toString(), registrableDomain };
  } catch {
    return null;
  }
}

export function buildWikiHomepageSetupPrompt(homepage: PublicWikiHomepage): string {
  return [
    `Set up our Workspace Wiki from ${homepage.url}.`,
    "Use native web search to inspect this homepage and useful pages on the same allowed domain.",
    "Write all page titles and contents in the language requested by your system instructions.",
    "If the site contains useful company information, make exactly one manage_wiki_pages call with action=create and requireEmpty=true. Create exactly these five pages, translating the titles naturally: Company Overview; Offerings & Value; Ideal Customers & Triggers; Sales Process; Voice, Proof & Guardrails.",
    "Use concise Markdown, include ordinary Markdown links to the supporting pages on the homepage domain, and clearly label information the site does not provide instead of guessing.",
    "If the site provides no useful company information, explain that here and do not create any pages.",
  ].join("\n\n");
}
