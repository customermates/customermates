import type { WikiSourceRecord } from "./wiki-website-crawl.service";

export function wikiSourceHeadings(sources: WikiSourceRecord[]): Map<string, string[]> {
  const headings = sources.map((source) => ({
    id: source.id,
    items: [...source.text.matchAll(/^#{1,4}\s+(.+)$/gm)].map((match) => ({
      text: match[1].trim(),
      key: match[1].trim().toLowerCase(),
    })),
  }));
  const frequency = new Map<string, number>();
  for (const source of headings)
    for (const key of new Set(source.items.map((item) => item.key))) frequency.set(key, (frequency.get(key) ?? 0) + 1);

  return new Map(
    headings.map((source) => [
      source.id,
      [...new Map(source.items.map((item) => [item.key, item])).values()]
        .sort((a, b) => (frequency.get(a.key) ?? 0) - (frequency.get(b.key) ?? 0))
        .map((item) => item.text.slice(0, 120)),
    ]),
  );
}
