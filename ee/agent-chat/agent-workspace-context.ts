import { encodeToToon } from "@/features/mcp-tools/utils";
import { wikiCodePointBoundary } from "@/features/wiki/wiki-page-chunk";
import { agentToolResultText } from "./agent-budget-policy";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function orderedWorkspaceContext(source: JsonRecord) {
  const wikiSource = record(source.wiki);
  const entrySource = record(wikiSource?.agentsMd);
  const wiki = wikiSource
    ? {
        ...wikiSource,
        agentsMd: entrySource ? { ...entrySource } : null,
        items: Array.isArray(wikiSource.items)
          ? wikiSource.items.map((item) => {
              const value = record(item);
              return value ? { ...value } : item;
            })
          : [],
      }
    : null;

  return {
    user: source.user,
    company: source.company,
    roles: source.roles,
    connectedAccounts: source.connectedAccounts,
    ...(wiki ? { wiki } : {}),
  };
}

function shortenWikiItems(wiki: JsonRecord, maximumChars: number, encode: () => string) {
  const items = Array.isArray(wiki.items)
    ? wiki.items.map(record).filter((item): item is JsonRecord => item !== null)
    : [];
  while (encode().length > maximumChars) {
    const candidates = items.flatMap((item) =>
      (["excerpt", "title"] as const)
        .filter((key) => typeof item[key] === "string")
        .map((key) => ({ item, key, characters: Array.from(item[key] as string) })),
    );
    candidates.sort((left, right) => right.characters.length - left.characters.length);
    const largest = candidates.find(({ key, characters }) => characters.length > (key === "excerpt" ? 40 : 24));
    if (!largest) break;
    const minimum = largest.key === "excerpt" ? 40 : 24;
    largest.item[largest.key] = largest.characters
      .slice(0, Math.max(minimum - 1, Math.floor(largest.characters.length / 2)))
      .join("")
      .concat("…");
    wiki.itemsShortened = true;
  }
}

export function hostedWorkspaceContextText(value: unknown, maximumChars: number): string {
  const source = record(value);
  if (!source) return agentToolResultText(encodeToToon(value), maximumChars);

  const context = orderedWorkspaceContext(source);
  const wiki = record(context.wiki);
  const entry = record(wiki?.agentsMd);
  const originalMarkdown = typeof entry?.markdownChunk === "string" ? entry.markdownChunk : null;
  const originalNextOffset = typeof entry?.nextOffset === "number" ? entry.nextOffset : null;
  const offset = typeof entry?.offset === "number" ? entry.offset : 0;
  const encode = () => encodeToToon(context);

  if (encode().length <= maximumChars) return encode();
  if (entry && originalMarkdown !== null) {
    entry.shortened = originalMarkdown.length > 0;
    entry.markdownChunk = "";
    if (originalMarkdown.length > 0) entry.nextOffset = offset;
  }
  if (wiki) shortenWikiItems(wiki, maximumChars, encode);

  if (entry && originalMarkdown !== null && encode().length <= maximumChars) {
    const payload = (end: number) => {
      entry.markdownChunk = originalMarkdown.slice(0, end);
      entry.nextOffset = end < originalMarkdown.length ? offset + end : originalNextOffset;
    };
    let low = 0;
    let high = originalMarkdown.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      payload(middle);
      if (encode().length <= maximumChars) low = middle;
      else high = middle - 1;
    }
    const end = wikiCodePointBoundary(originalMarkdown, low);
    payload(end);
    if (end < originalMarkdown.length) entry.shortened = true;
    else delete entry.shortened;
  }

  return agentToolResultText(encode(), maximumChars);
}
