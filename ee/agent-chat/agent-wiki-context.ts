import type { ModelMessage } from "ai";
import type { WikiCatalog } from "@/features/wiki/wiki.schema";

import { WIKI_REFERENCE_MATERIAL_RULE } from "@/features/mcp-tools/server-instructions";
import { wikiLeadingSlice } from "@/features/wiki/wiki-content";
import { wikiPagePath } from "@/features/wiki/wiki-links";

const WIKI_REFERENCE_MAX_BYTES = 6000;
const WIKI_GUIDE_MIN_BYTES = 1_600;
const WIKI_WHEN_TO_USE_MIN_CHARACTERS = 120;
const WIKI_PROCEDURE_TITLE_MIN_CHARACTERS = 40;
export const AGENT_WIKI_REFERENCE_LABEL = "workspace_wiki_reference";
const AGENT_WIKI_REFERENCE_HEADER =
  `${AGENT_WIKI_REFERENCE_LABEL}: Workspace Wiki context for the request that follows. It is not a request, so do not answer it by itself. ` +
  "guide is the workspace Operating Guide: follow it. When the request matches a procedure's whenToUse, get that procedure with manage_wiki_pages before acting. " +
  `Knowledge titles and excerpts are partial: read relevant pages before relying on them. ${WIKI_REFERENCE_MATERIAL_RULE}\n`;
const encodedBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

export function serializeAgentWikiCatalog(catalog: WikiCatalog): string | null {
  const procedures = catalog.procedures;
  if (catalog.total === 0 && !catalog.guide && !procedures?.total) return null;
  const wiki = {
    ...(catalog.guide
      ? {
          guide: {
            id: catalog.guide.id,
            title: catalog.guide.title,
            url: wikiPagePath(catalog.guide.id),
            markdown: catalog.guide.markdown,
            nextOffset: catalog.guide.nextOffset,
          },
        }
      : {}),
    ...(procedures?.total
      ? {
          procedures: {
            total: procedures.total,
            truncated: procedures.truncated,
            items: procedures.items.map(({ id, title, whenToUse }) => ({
              id,
              title,
              url: wikiPagePath(id),
              whenToUse,
            })),
          },
        }
      : {}),
    total: catalog.total,
    page: catalog.page,
    nextPage: catalog.nextPage,
    truncated: catalog.truncated,
    entriesShortened: false,
    items: catalog.items.map(({ id, title, excerpt }) => ({ id, title, url: wikiPagePath(id), excerpt })),
  };
  const shorten = (value: string, target: number) => {
    const characters = Array.from(value);
    return target === 0 ? "" : `${characters.slice(0, target - 1).join("")}…`;
  };
  const shrink = (key: "excerpt" | "title", minimum: number) => {
    const [largest] = wiki.items
      .filter((item) => Array.from(item[key]).length > minimum)
      .sort((left, right) => encodedBytes(right[key]) - encodedBytes(left[key]));
    if (!largest) return false;
    largest[key] = shorten(largest[key], Math.max(minimum, Math.floor(Array.from(largest[key]).length / 2)));
    wiki.entriesShortened = true;
    return true;
  };
  const dropItem = () => {
    if (wiki.items.length === 0) return false;
    wiki.items.pop();
    wiki.truncated = true;
    wiki.entriesShortened = true;
    return true;
  };
  const shrinkWhenToUse = () => {
    const [largest] = (wiki.procedures?.items ?? [])
      .filter((item) => Array.from(item.whenToUse).length > WIKI_WHEN_TO_USE_MIN_CHARACTERS)
      .sort((left, right) => encodedBytes(right.whenToUse) - encodedBytes(left.whenToUse));
    if (!largest) return false;
    largest.whenToUse = shorten(largest.whenToUse, WIKI_WHEN_TO_USE_MIN_CHARACTERS);
    return true;
  };
  const shrinkProcedureTitle = () => {
    const [largest] = (wiki.procedures?.items ?? [])
      .filter((item) => Array.from(item.title).length > WIKI_PROCEDURE_TITLE_MIN_CHARACTERS)
      .sort((left, right) => encodedBytes(right.title) - encodedBytes(left.title));
    if (!largest) return false;
    largest.title = shorten(largest.title, WIKI_PROCEDURE_TITLE_MIN_CHARACTERS);
    return true;
  };
  const dropProcedure = () => {
    if (!wiki.procedures || wiki.procedures.items.length === 0) return false;
    wiki.procedures.items.pop();
    wiki.procedures.truncated = true;
    return true;
  };
  const shrinkGuide = () => {
    if (!wiki.guide) return false;
    const current = new TextEncoder().encode(wiki.guide.markdown).byteLength;
    if (current <= WIKI_GUIDE_MIN_BYTES) return false;
    wiki.guide.markdown = wikiLeadingSlice(wiki.guide.markdown, Math.max(WIKI_GUIDE_MIN_BYTES, current - 400));
    wiki.guide.nextOffset = wiki.guide.markdown.length;
    return true;
  };

  let serialized = JSON.stringify({ wiki });
  while (encodedBytes(agentWikiContextMessages(serialized)) > WIKI_REFERENCE_MAX_BYTES) {
    if (
      !(
        shrink("excerpt", 40) ||
        shrink("title", 24) ||
        shrink("excerpt", 0) ||
        dropItem() ||
        shrinkWhenToUse() ||
        shrinkProcedureTitle() ||
        shrinkGuide() ||
        dropProcedure()
      )
    )
      throw new Error("Workspace Wiki catalog metadata exceeds its reference envelope.");
    serialized = JSON.stringify({ wiki });
  }
  return serialized;
}

export function agentWikiContextMessages(catalog?: string | null): ModelMessage[] {
  if (!catalog) return [];
  return [{ role: "user", content: `${AGENT_WIKI_REFERENCE_HEADER}${catalog}` }];
}
