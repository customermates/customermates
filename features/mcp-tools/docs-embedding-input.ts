import { retrievalEmbeddingText } from "@/core/retrieval/retrieval-sections";

export const DOCS_EMBEDDING_FORMAT = "docs-embedding-v3";

type EmbeddingPart = {
  contentHash: string;
  label: string;
  embeddingBody: string;
};

export function docsEmbeddingBody(text: string): string {
  return text.trim();
}

export function docsEmbeddingText(part: Pick<EmbeddingPart, "label" | "embeddingBody">): string {
  return retrievalEmbeddingText(part.label, part.embeddingBody);
}

export function docsPendingEmbeddingTexts(
  corpus: { parts: readonly EmbeddingPart[] },
  pending: readonly { contentHash: string }[],
): string[] {
  const byHash = new Map(corpus.parts.map((part) => [part.contentHash, part]));
  return pending.map(({ contentHash }) => {
    const part = byHash.get(contentHash);
    if (!part) throw new Error("Pending documentation embedding is absent from the current corpus.");
    return docsEmbeddingText(part);
  });
}
