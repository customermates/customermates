import { retrievalChunkText, type RetrievalWindow } from "@/core/retrieval/retrieval-chunks";

export const DOCS_EMBEDDING_FORMAT = "docs-embedding-v2";

type EmbeddingChunk = {
  contentHash: string;
  label: string;
  embeddingBody: string;
};

export function docsEmbeddingBody(body: string, window: RetrievalWindow): string {
  const end = window.offset + window.text.length;
  const ranges: { start: number; end: number }[] = [];
  let fence: { marker: string; length: number } | undefined;
  for (const line of body.matchAll(/[^\n]*(?:\n|$)/gu)) {
    const marker = line[0].match(/^ {0,3}(`{3,}|~{3,})/u)?.[1];
    if (marker) {
      if (!fence) fence = { marker: marker[0], length: marker.length };
      else if (
        marker[0] === fence.marker &&
        marker.length >= fence.length &&
        line[0].slice(line[0].indexOf(marker) + marker.length).trim() === ""
      )
        fence = undefined;
      continue;
    }
    if (!fence && /^\*\*Link:\*\*/u.test(line[0])) ranges.push({ start: line.index, end: line.index + line[0].length });
  }
  const parts: string[] = [];
  let cursor = window.offset;
  for (const range of ranges) {
    if (range.end <= cursor || range.start >= end) continue;
    parts.push(body.slice(cursor, Math.max(cursor, range.start)));
    cursor = Math.min(end, range.end);
  }
  parts.push(body.slice(cursor, end));
  return parts.join("").trim();
}

export function docsEmbeddingText(chunk: Pick<EmbeddingChunk, "label" | "embeddingBody">): string {
  return retrievalChunkText(chunk.label, chunk.embeddingBody);
}

export function docsPendingEmbeddingTexts(
  corpus: { chunks: readonly EmbeddingChunk[] },
  pending: readonly { contentHash: string }[],
): string[] {
  const byHash = new Map(corpus.chunks.map((chunk) => [chunk.contentHash, chunk]));
  return pending.map(({ contentHash }) => {
    const chunk = byHash.get(contentHash);
    if (!chunk) throw new Error("Pending documentation embedding is absent from the current corpus.");
    return docsEmbeddingText(chunk);
  });
}
