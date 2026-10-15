import { wikiSemanticChunks } from "@/features/wiki/wiki-chunks";

export const RECORD_FILE_MAX_CHUNKS = 1_000;
const LANDING_PROBE_LENGTH = 64;
const LANDING_LINE_REACH = 400;

export type RecordFileChunkDraft = {
  ordinal: number;
  offset: number;
  heading: string | null;
  text: string;
  contentHash: string;
};

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
  return wikiSemanticChunks(name, text, RECORD_FILE_MAX_CHUNKS).map((chunk) => {
    const first = chunk.offset !== section;
    section = chunk.offset;
    if (first) cursor = chunk.offset;
    const start = first ? -1 : windowStart(text, cursor, windowBody(chunk.text));
    if (start >= 0) cursor = Math.max(cursor, start);
    return {
      ordinal: chunk.ordinal,
      offset: start >= chunk.offset ? start : chunk.offset,
      heading: chunk.section,
      text: chunk.text,
      contentHash: chunk.contentHash,
    };
  });
}
