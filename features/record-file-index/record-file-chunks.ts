import { createHash } from "node:crypto";

import {
  codePointBoundary,
  RETRIEVAL_SECTION_MAX_LENGTH,
  retrievalEmbeddingText,
  retrievalSectionLabel,
} from "@/core/retrieval/retrieval-sections";
import { boundedWikiSectionLabel, wikiMarkdownSections } from "@/features/wiki/wiki-markdown-sections";

export const RECORD_FILE_MAX_CHUNKS = 1_000;
const RETRIEVAL_WINDOW_OVERLAP = 200;
const LANDING_PROBE_LENGTH = 64;
const LANDING_LINE_REACH = 400;

export type RecordFileChunkDraft = {
  ordinal: number;
  offset: number;
  heading: string | null;
  text: string;
  contentHash: string;
};

type TextChunk = { offset: number; section: string | null; text: string; contentHash: string };

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function retrievalWindows(text: string): Array<{ offset: number; text: string }> {
  if (text.length <= RETRIEVAL_SECTION_MAX_LENGTH) return [{ offset: 0, text }];
  const windows: Array<{ offset: number; text: string }> = [];
  let start = 0;
  while (start < text.length) {
    const end = codePointBoundary(text, Math.min(text.length, start + RETRIEVAL_SECTION_MAX_LENGTH));
    windows.push({ offset: start, text: text.slice(start, end) });
    if (end >= text.length) break;
    start = codePointBoundary(text, end - RETRIEVAL_WINDOW_OVERLAP);
  }
  return windows;
}

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

export function markdownTextChunks(title: string, markdown: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  for (const section of wikiMarkdownSections(markdown)) {
    if (chunks.length >= RECORD_FILE_MAX_CHUNKS) break;
    const path = section.path.map(boundedWikiSectionLabel);
    const body = markdown.slice(section.offset, section.end);
    const newline = body.indexOf("\n");
    const content = withoutLinkTargets(section.level === 0 ? body : newline < 0 ? "" : body.slice(newline + 1)).trim();
    const heading = path.at(-1) ?? "";
    if (!content && !heading) continue;
    const label = retrievalSectionLabel(title, heading ? [heading] : []);
    for (const { text: part } of retrievalWindows(content)) {
      if (chunks.length >= RECORD_FILE_MAX_CHUNKS) break;
      const text = retrievalEmbeddingText(label, part);
      chunks.push({ offset: section.offset, section: path.join(" > ") || null, text, contentHash: sha256(text) });
    }
  }
  return chunks.length > 0 ? chunks : [{ offset: 0, section: null, text: title, contentHash: sha256(title) }];
}

function windowBody(chunkText: string): string {
  const separator = chunkText.indexOf("\n\n");
  return separator < 0 ? "" : chunkText.slice(separator + 2);
}

function windowStart(text: string, from: number, body: string): number {
  const probe = body.split("\n", 1)[0].slice(0, LANDING_PROBE_LENGTH);
  if (!probe.trim()) return -1;
  const found = text.indexOf(probe, from);
  if (found < 0) return -1;
  const line = text.lastIndexOf("\n", found - 1) + 1;
  return found - line <= LANDING_LINE_REACH ? line : found;
}

export function recordFileChunks(name: string, text: string): RecordFileChunkDraft[] {
  let section = -1;
  let cursor = 0;
  return markdownTextChunks(name, text).map((chunk, ordinal) => {
    const first = chunk.offset !== section;
    section = chunk.offset;
    if (first) cursor = chunk.offset;
    const start = first ? -1 : windowStart(text, cursor, windowBody(chunk.text));
    if (start >= 0) cursor = Math.max(cursor, start);
    return {
      ordinal,
      offset: start >= chunk.offset ? start : chunk.offset,
      heading: chunk.section,
      text: chunk.text,
      contentHash: chunk.contentHash,
    };
  });
}
