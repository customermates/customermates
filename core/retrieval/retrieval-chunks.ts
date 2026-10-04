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
