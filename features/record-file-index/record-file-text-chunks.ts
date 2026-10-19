import { createHash } from "node:crypto";

import { boundedWikiText, wikiMarkdownSections } from "@/features/wiki/wiki-markdown-sections";

export const RETRIEVAL_CHUNK_MAX_LENGTH = 1_800;
const RETRIEVAL_CHUNK_OVERLAP = 200;

export type RetrievalWindow = { offset: number; text: string };

function codePointBoundary(value: string, offset: number): number {
  if (offset <= 0 || offset >= value.length) return offset;
  const low = value.charCodeAt(offset);
  const high = value.charCodeAt(offset - 1);
  return low >= 0xdc00 && low <= 0xdfff && high >= 0xd800 && high <= 0xdbff ? offset - 1 : offset;
}

export function retrievalWindows(text: string): RetrievalWindow[] {
  if (text.length <= RETRIEVAL_CHUNK_MAX_LENGTH) return [{ offset: 0, text }];
  const windows: RetrievalWindow[] = [];
  let start = 0;
  while (start < text.length) {
    const end = codePointBoundary(text, Math.min(text.length, start + RETRIEVAL_CHUNK_MAX_LENGTH));
    windows.push({ offset: start, text: text.slice(start, end) });
    if (end >= text.length) break;
    start = codePointBoundary(text, end - RETRIEVAL_CHUNK_OVERLAP);
  }
  return windows;
}

export function retrievalChunkText(label: string, body: string): string {
  return body ? `${label}\n\n${body}` : label;
}

const TEXT_CHUNKS_MAX = 256;

export type TextChunkOptions = { maxChunks?: number; maxHeadingLength?: number };

export type TextChunk = {
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

export function markdownTextChunks(
  title: string,
  markdown: string,
  { maxChunks = TEXT_CHUNKS_MAX, maxHeadingLength }: TextChunkOptions = {},
): TextChunk[] {
  const chunks: TextChunk[] = [];
  for (const section of wikiMarkdownSections(markdown)) {
    if (chunks.length >= maxChunks) break;
    const path =
      maxHeadingLength === undefined
        ? section.path
        : section.path.map((heading) => boundedWikiText(heading, maxHeadingLength));
    const body = markdown.slice(section.offset, section.end);
    const newline = body.indexOf("\n");
    const content = withoutLinkTargets(section.level === 0 ? body : newline < 0 ? "" : body.slice(newline + 1)).trim();
    const heading = path.at(-1) ?? "";
    if (!content && !heading) continue;
    const label = heading && heading !== title ? `${title} > ${heading}` : title;
    for (const { text: part } of retrievalWindows(content)) {
      if (chunks.length >= maxChunks) break;
      const text = retrievalChunkText(label, part);
      chunks.push({
        ordinal: chunks.length,
        offset: section.offset,
        section: path.join(" > ") || null,
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
