import type { PublicWikiHomepage } from "@/features/wiki/wiki-homepage";

import { parsePublicWikiHomepage } from "@/features/wiki/wiki-homepage";

const MAX_USER_WEBSITES = 20;
const USER_TEXT_TOKEN_SEPARATOR = /[\s<>"'`()[\]{}|,;«»“”‘’]+/u;

export function userWebsiteHomepages(userTexts: readonly string[]): string[] {
  const homepages = new Set<string>();
  for (const text of userTexts) {
    for (const rawToken of text.split(USER_TEXT_TOKEN_SEPARATOR)) {
      if (homepages.size >= MAX_USER_WEBSITES) return [...homepages];
      if (rawToken.includes("@")) continue;
      const token = rawToken.replace(/[.:!?]+$/u, "").trim();
      if (!token.includes(".")) continue;
      const homepage = parsePublicWikiHomepage(token);
      if (homepage) homepages.add(homepage.url);
    }
  }
  return [...homepages];
}

export function userWebsiteHomepage(userHomepages: readonly string[], value: string): PublicWikiHomepage | null {
  const homepage = parsePublicWikiHomepage(value);
  if (!homepage) return null;
  if (userHomepages.includes(homepage.url)) return homepage;
  const host = new URL(homepage.url).hostname;
  return userHomepages.some((userHomepage) => new URL(userHomepage).hostname === host)
    ? parsePublicWikiHomepage(`https://${host}/`)
    : null;
}
