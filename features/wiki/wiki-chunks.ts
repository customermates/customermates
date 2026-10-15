import { createHash } from "node:crypto";

import { retrievalChunkText, retrievalWindows } from "@/core/retrieval/retrieval-chunks";

import { wikiMarkdownSections } from "./wiki-markdown-sections";

const WIKI_SEMANTIC_MAX_CHUNKS = 256;

export type WikiSemanticChunk = {
  ordinal: number;
  offset: number;
  section: string | null;
  text: string;
  contentHash: string;
};

function nextIndex(text: string, search: string, from: number): number {
  const found = text.indexOf(search, from);
  return found < 0 ? text.length : found;
}

function withoutLinkTargets(text: string): string {
  let result = "";
  let from = 0;
  let paren = -1;
  let newline = -1;
  for (let index = text.indexOf("]("); index >= 0; ) {
    const start = index + 2;
    if (paren < start) paren = nextIndex(text, ")", start);
    if (paren === text.length) break;
    if (newline < start) newline = nextIndex(text, "\n", start);
    if (newline < paren) {
      index = text.indexOf("](", newline + 1);
      continue;
    }
    result += text.slice(from, index + 1);
    from = paren + 1;
    index = text.indexOf("](", from);
  }
  return result + text.slice(from);
}

export function wikiSemanticChunks(
  title: string,
  markdown: string,
  maxChunks = WIKI_SEMANTIC_MAX_CHUNKS,
): WikiSemanticChunk[] {
  const chunks: WikiSemanticChunk[] = [];
  for (const section of wikiMarkdownSections(markdown)) {
    const body = markdown.slice(section.offset, section.end);
    const newline = body.indexOf("\n");
    const content = withoutLinkTargets(section.level === 0 ? body : newline < 0 ? "" : body.slice(newline + 1)).trim();
    const heading = section.path.at(-1) ?? "";
    if (!content && !heading) continue;
    const label = heading && heading !== title ? `${title} > ${heading}` : title;
    for (const { text: part } of retrievalWindows(content)) {
      const text = retrievalChunkText(label, part);
      chunks.push({
        ordinal: chunks.length,
        offset: section.offset,
        section: section.path.join(" > ") || null,
        text,
        contentHash: createHash("sha256").update(text).digest("hex"),
      });
    }
  }
  if (chunks.length === 0) {
    chunks.push({
      ordinal: 0,
      offset: 0,
      section: null,
      text: title,
      contentHash: createHash("sha256").update(title).digest("hex"),
    });
  }
  return chunks.slice(0, maxChunks);
}
