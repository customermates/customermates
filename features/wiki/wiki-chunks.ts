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
  return chunks.slice(0, WIKI_SEMANTIC_MAX_CHUNKS);
}
