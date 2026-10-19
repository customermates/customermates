import { wikiContentHash } from "./wiki-sections";

export const WIKI_SUMMARY_MAX_LENGTH = 160;

export type WikiSummaryState = {
  title: string;
  markdown: string;
  updatedAt: Date;
  summary: string | null;
  summaryContentHash: string | null;
  sourceImportedUpdatedAt: Date | null;
};

export function isUntouchedWikiImport(page: Pick<WikiSummaryState, "updatedAt" | "sourceImportedUpdatedAt">): boolean {
  return page.sourceImportedUpdatedAt !== null && page.updatedAt.getTime() === page.sourceImportedUpdatedAt.getTime();
}

export function currentWikiSummary(page: WikiSummaryState): string | null {
  return page.summary && page.summaryContentHash === wikiContentHash(page) ? page.summary : null;
}

export function promptWikiSummary(page: WikiSummaryState): string | null {
  return isUntouchedWikiImport(page) ? null : currentWikiSummary(page);
}

export function wikiSummaryNeeded(page: WikiSummaryState): boolean {
  return !isUntouchedWikiImport(page) && page.summaryContentHash !== wikiContentHash(page);
}

export function boundedWikiSummary(value: string): string | null {
  const compact = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  if (!compact) return null;
  if (compact.length <= WIKI_SUMMARY_MAX_LENGTH) return compact;
  const characters = Array.from(compact);
  let cut = "";
  for (const character of characters) {
    if (cut.length + character.length > WIKI_SUMMARY_MAX_LENGTH - 1) break;
    cut += character;
  }
  const space = cut.lastIndexOf(" ");
  return `${(space > WIKI_SUMMARY_MAX_LENGTH / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
