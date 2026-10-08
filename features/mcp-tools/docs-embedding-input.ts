import { retrievalChunkText, type RetrievalWindow } from "@/core/retrieval/retrieval-chunks";

export const DOCS_EMBEDDING_FORMAT = "docs-embedding-v2";

type EmbeddingChunk = {
  contentHash: string;
  label: string;
  embeddingBody: string;
};

export function docsEmbeddingBody(body: string, window: RetrievalWindow): string {
  return body.slice(window.offset, window.offset + window.text.length).trim();
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
