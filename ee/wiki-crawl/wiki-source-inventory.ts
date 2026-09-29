import type { WikiSourceRecord } from "./wiki-website-crawl.service";

const INVENTORY_MAX_BYTES = 24_000;
const ENTRY_MAX_BYTES = 590;
const encode = (value: unknown) => JSON.stringify(value).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
const bytes = (value: string) => new TextEncoder().encode(value).byteLength;

export function wikiSourceInventory(sources: WikiSourceRecord[], imported: ReadonlySet<string>): string {
  const items = sources.map((source) => {
    const entry = {
      id: source.id,
      url: source.url,
      title: source.title,
      headings: [...source.text.matchAll(/^#{1,4}\s+(.+)$/gm)].map((match) => match[1]).join(" | "),
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
