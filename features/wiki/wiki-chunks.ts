import { createHash } from "node:crypto";

import { wikiCodePointBoundary } from "./wiki-page-chunk";
import { wikiMarkdownSections } from "./wiki-search";

export const WIKI_SEMANTIC_CHUNK_MAX_LENGTH = 1_800;
const WIKI_SEMANTIC_CHUNK_OVERLAP = 200;
const WIKI_SEMANTIC_MAX_CHUNKS = 256;

export type WikiSemanticChunk = {
  ordinal: number;
  offset: number;
  section: string | null;
  text: string;
  contentHash: string;
};

function windows(text: string): string[] {
  if (text.length <= WIKI_SEMANTIC_CHUNK_MAX_LENGTH) return [text];
  const parts: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = wikiCodePointBoundary(text, Math.min(text.length, start + WIKI_SEMANTIC_CHUNK_MAX_LENGTH));
    parts.push(text.slice(start, end));
    if (end >= text.length) break;
    start = wikiCodePointBoundary(text, end - WIKI_SEMANTIC_CHUNK_OVERLAP);
  }
  return parts;
}

export function wikiSemanticChunks(title: string, markdown: string): WikiSemanticChunk[] {
  const chunks: WikiSemanticChunk[] = [];
  for (const section of wikiMarkdownSections(markdown)) {
    const body = markdown.slice(section.offset, section.end);
    const newline = body.indexOf("\n");
    const content = (section.level === 0 ? body : newline < 0 ? "" : body.slice(newline + 1))
      .replace(/\]\([^)\n]*\)/gu, "]")
      .trim();
    const heading = section.path.at(-1) ?? "";
    if (!content && !heading) continue;
    const label = heading && heading !== title ? `${title} > ${heading}` : title;
    for (const part of windows(content)) {
      const text = part ? `${label}\n\n${part}` : label;
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
  return chunks.slice(0, WIKI_SEMANTIC_MAX_CHUNKS);
}
