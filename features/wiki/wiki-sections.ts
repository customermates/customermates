import { createHash } from "node:crypto";

import {
  retrievalEmbeddingText,
  retrievalSectionLabel,
  retrievalSectionParts,
} from "@/core/retrieval/retrieval-sections";
import { slugifyHeading } from "@/core/utils/search-text";

import { wikiMarkdownSections } from "./wiki-markdown-sections";

const WIKI_SECTION_MAX_ROWS = 256;

export type WikiSectionRow = {
  ordinal: number;
  offset: number;
  headingPath: string[];
  anchor: string;
  text: string;
  contentHash: string;
  embeddingText: string;
};

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function wikiContentHash(page: { title: string; markdown: string }): string {
  return sha256(`${page.title}\n${page.markdown}`);
}

export function wikiSectionRows(page: { title: string; markdown: string }, summary: string | null): WikiSectionRow[] {
  const rows: WikiSectionRow[] = [];
  const push = (offset: number, headingPath: string[], text: string) => {
    const embeddingText = retrievalEmbeddingText(retrievalSectionLabel(page.title, headingPath), text, summary);
    rows.push({
      ordinal: rows.length,
      offset,
      headingPath,
      anchor: headingPath.length > 0 ? slugifyHeading(headingPath.at(-1) ?? "") : "",
      text,
      contentHash: sha256(embeddingText),
      embeddingText,
    });
  };
  for (const section of wikiMarkdownSections(page.markdown)) {
    const body = page.markdown.slice(section.offset, section.end);
    const newline = body.indexOf("\n");
    const content = (section.level === 0 ? body : newline < 0 ? "" : body.slice(newline + 1))
      .replace(/\]\([^)\n]*\)/gu, "]")
      .trim();
    if (!content && section.path.length === 0) continue;
    for (const part of retrievalSectionParts(content)) push(section.offset, section.path, part);
  }
  if (rows.length === 0) push(0, [], "");
  return rows.slice(0, WIKI_SECTION_MAX_ROWS);
}
