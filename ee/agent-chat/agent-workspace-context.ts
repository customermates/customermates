import { encodeToToon } from "@/features/mcp-tools/utils";
import { wikiMarkdownChunk } from "@/features/wiki/wiki-page-chunk";
import { wikiPagePath } from "@/features/wiki/wiki-links";
import { agentToolResultText } from "./agent-budget-policy";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function hostedWikiItem(value: unknown) {
  const item = record(value);
  if (!item) return value;
  const id = typeof item.id === "string" ? item.id : null;
  return { ...item, ...(id ? { url: wikiPagePath(id) } : {}) };
}

function hostedWikiRelevantPage(value: unknown) {
  const item = record(hostedWikiItem(value));
  if (!item) return value;
  const previewOffset = typeof item.previewOffset === "number" ? item.previewOffset : 0;
  const previewEnd = typeof item.previewEnd === "number" ? item.previewEnd : previewOffset;
  const totalChars = typeof item.totalChars === "number" ? item.totalChars : previewEnd;
  return {
    ...item,
    shortened: previewOffset > 0 || previewEnd < totalChars,
  };
}

function orderedWorkspaceContext(source: JsonRecord) {
  const wikiSource = record(source.wiki);
  const wiki = wikiSource
    ? {
        ...wikiSource,
        items: Array.isArray(wikiSource.items) ? wikiSource.items.map(hostedWikiItem) : [],
        relevantPages: Array.isArray(wikiSource.relevantPages)
          ? wikiSource.relevantPages.map(hostedWikiRelevantPage)
          : [],
        previewsShortened: Array.isArray(wikiSource.relevantPages)
          ? wikiSource.relevantPages.some((value) => {
              const page = record(value);
              const offset = typeof page?.previewOffset === "number" ? page.previewOffset : 0;
              const end = typeof page?.previewEnd === "number" ? page.previewEnd : offset;
              const total = typeof page?.totalChars === "number" ? page.totalChars : end;
              return offset > 0 || end < total;
            })
          : false,
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

function wikiEntries(wiki: JsonRecord): JsonRecord[] {
  return [wiki.items, wiki.relevantPages]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .map(record)
    .filter((item): item is JsonRecord => item !== null);
}

function shortenWikiItems(wiki: JsonRecord, maximumChars: number, encode: () => string) {
  const items = wikiEntries(wiki);
  while (encode().length > maximumChars) {
    const candidates = items.flatMap((item) =>
      (["excerpt", "title"] as const)
        .filter((key) => typeof item[key] === "string")
        .map((key) => ({
          item,
          key,
          characters: Array.from(item[key] as string),
        })),
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

export function hostedWorkspaceContextText(value: unknown, maximumChars: number, baseUrl: string): string {
  const source = record(value);
  if (!source) return agentToolResultText(encodeToToon(value), maximumChars);

  const context = orderedWorkspaceContext(source);
  const wiki = record(context.wiki);
  const relevantPages = Array.isArray(wiki?.relevantPages)
    ? wiki.relevantPages.map(record).filter((page): page is JsonRecord => page !== null)
    : [];
  const originalPreviews = relevantPages.map((page) => ({
    page,
    markdown: typeof page.markdownPreview === "string" ? page.markdownPreview : "",
    previewOffset: typeof page.previewOffset === "number" ? page.previewOffset : 0,
    previewEnd: typeof page.previewEnd === "number" ? page.previewEnd : 0,
    totalChars: typeof page.totalChars === "number" ? page.totalChars : 0,
  }));
  const encode = () => encodeToToon(context);

  if (encode().length <= maximumChars) return encode();
  for (const preview of originalPreviews) {
    preview.page.markdownPreview = "";
    preview.page.previewEnd = preview.previewOffset;
    preview.page.shortened = preview.markdown.length > 0;
    if (wiki && preview.markdown.length > 0) wiki.previewsShortened = true;
  }
  if (wiki) shortenWikiItems(wiki, maximumChars, encode);

  for (const preview of originalPreviews) {
    if (!preview.markdown || encode().length > maximumChars) continue;
    const apply = (characters: number) => {
      const chunk = wikiMarkdownChunk(preview.markdown, 0, characters, baseUrl);
      preview.page.markdownPreview = chunk.markdownChunk;
      preview.page.previewEnd = preview.previewOffset + chunk.markdownChunk.length;
      preview.page.shortened =
        preview.previewOffset > 0 ||
        preview.previewEnd < preview.totalChars ||
        (preview.page.previewEnd as number) < preview.previewEnd;
      if (wiki && preview.page.shortened) wiki.previewsShortened = true;
    };
    let low = 0;
    let high = preview.markdown.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      apply(middle);
      if (encode().length <= maximumChars) low = middle;
      else high = middle - 1;
    }
    apply(low);
  }

  return agentToolResultText(encode(), maximumChars);
}
