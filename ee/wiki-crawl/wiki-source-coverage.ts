import type { WikiSourceRecord, WikiImportedPage } from "./wiki-website-crawl.service";

import { encode } from "@toon-format/toon";
import { wikiSourceResultText } from "./wiki-source-result";

export const WIKI_SOURCE_RESULT_MAX_CHARS = 48_000;

export function wikiSourceResultFits(result: string): boolean {
  return new TextEncoder().encode(JSON.stringify(result)).byteLength <= WIKI_SOURCE_RESULT_MAX_CHARS - 1_000;
}

export function wikiSourcePayloadFits(payload: unknown): boolean {
  return wikiSourceResultFits(encode(payload)) && wikiSourceResultFits(wikiSourceResultText(payload));
}

export function sourceFullyRead(source: Pick<WikiSourceRecord, "text" | "readOffset">): boolean {
  return Number.isSafeInteger(source.readOffset) && source.readOffset >= source.text.length;
}

export async function wikiSourceCoverage(
  repo: {
    listSources(crawlId: string): Promise<WikiSourceRecord[]>;
    findImportedPage(
      url: string,
    ): Promise<Pick<WikiImportedPage, "sourceContentHash" | "updatedAt" | "sourceImportedUpdatedAt"> | null>;
  },
  crawlId: string,
) {
  const sources = await repo.listSources(crawlId);
  const imported = new Set<string>();
  await Promise.all(
    sources.map(async (source) => {
      const page = await repo.findImportedPage(source.url);
      if (
        page?.sourceContentHash === source.contentHash &&
        page.sourceImportedUpdatedAt !== null &&
        page.updatedAt.getTime() === page.sourceImportedUpdatedAt.getTime()
      )
        imported.add(source.id);
    }),
  );
  const readHashes = new Set(sources.filter(sourceFullyRead).map(({ contentHash }) => contentHash));
  const importedHashes = new Set(sources.filter(({ id }) => imported.has(id)).map(({ contentHash }) => contentHash));
  const pending = new Map<string, WikiSourceRecord>();
  for (const source of sources) {
    if (readHashes.has(source.contentHash) || importedHashes.has(source.contentHash)) continue;
    const previous = pending.get(source.contentHash);
    if (!previous || source.readOffset > previous.readOffset) pending.set(source.contentHash, source);
  }
  return { sources, imported, readHashes, pending: [...pending.values()] };
}
