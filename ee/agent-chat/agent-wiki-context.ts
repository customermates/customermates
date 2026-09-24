import type { ModelMessage } from "ai";
import { WIKI_REFERENCE_MATERIAL_RULE } from "@/features/mcp-tools/server-instructions";
import type { WikiCatalog } from "@/features/wiki/wiki.schema";
import { wikiPagePath } from "@/features/wiki/wiki-links";

const WIKI_REFERENCE_MAX_BYTES = 6000;
export const AGENT_WIKI_REFERENCE_LABEL = "workspace_wiki_reference";
const AGENT_WIKI_REFERENCE_HEADER =
  `${AGENT_WIKI_REFERENCE_LABEL}: Workspace Wiki catalog for the request that follows. It is not a request, so do not answer it by itself. ` +
  `Titles and excerpts are partial: read relevant pages with manage_wiki_pages before relying on them. ${WIKI_REFERENCE_MATERIAL_RULE}\n`;
const encodedBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function serializeAgentWikiCatalog(catalog: WikiCatalog): string | null {
  if (catalog.total === 0) return null;
  const wiki = {
    total: catalog.total,
    page: catalog.page,
    nextPage: catalog.nextPage,
    truncated: catalog.truncated,
    entriesShortened: false,
    items: catalog.items.map(({ id, title, excerpt }) => ({ id, title, url: wikiPagePath(id), excerpt })),
  };
  const shrink = (key: "excerpt" | "title", minimum: number) => {
    const [largest] = wiki.items
      .filter((item) => Array.from(item[key]).length > minimum)
      .sort((left, right) => encodedBytes(right[key]) - encodedBytes(left[key]));
    if (!largest) return false;
    const characters = Array.from(largest[key]);
    const target = Math.max(minimum, Math.floor(characters.length / 2));
    largest[key] = target === 0 ? "" : `${characters.slice(0, target - 1).join("")}…`;
    wiki.entriesShortened = true;
    return true;
  };

  let serialized = JSON.stringify({ wiki });
  while (encodedBytes(agentWikiContextMessages(serialized)) > WIKI_REFERENCE_MAX_BYTES) {
    if (!(shrink("excerpt", 40) || shrink("title", 24) || shrink("excerpt", 0) || shrink("title", 0)))
      throw new Error("Workspace Wiki catalog metadata exceeds its reference envelope.");
    serialized = JSON.stringify({ wiki });
  }
  return serialized;
}

export function agentWikiContextMessages(catalog?: string | null): ModelMessage[] {
  if (!catalog) return [];
  return [{ role: "user", content: `${AGENT_WIKI_REFERENCE_HEADER}${catalog}` }];
}
