import type { WikiSourceRecord } from "./wiki-website-crawl.service";

const INVENTORY_MAX_BYTES = 24_000;
const ENTRY_MAX_BYTES = 590;
const encode = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;

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

export function wikiSourceInventory(sources: WikiSourceRecord[], imported: ReadonlySet<string>): string {
  const headings = wikiSourceHeadings(sources);
  const items = sources.map((source) => {
    const entry = {
      id: source.id,
      url: source.url,
      title: source.title,
      headings: (headings.get(source.id) ?? []).join(" | "),
      imported: imported.has(source.id),
    };
    while (bytes(encode(entry)) > ENTRY_MAX_BYTES) {
      const field = (["headings", "title", "url"] as const).reduce((largest, key) =>
        bytes(encode(entry[key])) > bytes(encode(entry[largest])) ? key : largest,
      );
      if (!entry[field]) throw new Error("Website source identity exceeds the inventory budget.");
      entry[field] = Array.from(entry[field])
        .slice(0, Math.floor(Array.from(entry[field]).length / 2))
        .join("");
    }
    return entry;
  });
  const result = encode({ items });
  if (bytes(result) > INVENTORY_MAX_BYTES) throw new Error("Website source inventory exceeds the context budget.");
  return result;
}
