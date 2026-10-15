import type { RecordFileSemanticIndexer } from "@/features/record-file-index/record-file-semantic-indexer";
import type { WikiEmbeddingService } from "@/ee/wiki-retrieval/wiki-embedding.service";
import type { RecordFileSemanticIndexRepo } from "./record-file-semantic-index.repo";

import {
  embeddingVectorLiteral,
  WIKI_EMBEDDING_BATCH_SIZE,
  WIKI_EMBEDDING_MODEL,
} from "@/ee/wiki-retrieval/wiki-embedding-model";

export const RECORD_FILE_SEMANTIC_BATCH_FILES = 8;
export const RECORD_FILE_SEMANTIC_BATCHES_PER_STEP = 8;

type FileEmbedding = { calls: number; complete: boolean; paused: boolean };

export class RecordFileSemanticIndexService implements RecordFileSemanticIndexer {
  constructor(
    private repo: RecordFileSemanticIndexRepo,
    private embeddings: WikiEmbeddingService,
    private companyId: string,
  ) {}

  async embedPending(): Promise<{ embedded: number; remaining: boolean }> {
    if (!(await this.repo.semanticIndexAvailable())) return { embedded: 0, remaining: false };
    if (!(await this.embeddings.authorizeIndexing(this.companyId, "fileIndexing")))
      return { embedded: 0, remaining: false };
    const files = await this.repo.claimUnembeddedFiles(WIKI_EMBEDDING_MODEL, RECORD_FILE_SEMANTIC_BATCH_FILES);
    let calls = 0;
    let embedded = 0;
    let unfinished = false;
    try {
      for (const fileId of files) {
        const remainingCalls = RECORD_FILE_SEMANTIC_BATCHES_PER_STEP - calls;
        if (remainingCalls <= 0) {
          unfinished = true;
          break;
        }
        const result = await this.embedFile(fileId, remainingCalls);
        calls += result.calls;
        if (result.complete) embedded += 1;
        else unfinished = true;
        if (result.paused) return { embedded, remaining: false };
      }
    } finally {
      await this.repo.releaseFileClaims(files);
    }
    return { embedded, remaining: unfinished || files.length === RECORD_FILE_SEMANTIC_BATCH_FILES };
  }

  private async embedFile(fileId: string, maxCalls: number): Promise<FileEmbedding> {
    const grant = await this.embeddings.authorizeIndexing(this.companyId, "fileIndexing");
    if (!grant) return { calls: 0, complete: false, paused: true };
    const limit = maxCalls * WIKI_EMBEDDING_BATCH_SIZE;
    const chunks = await this.repo.unembeddedChunks(fileId, WIKI_EMBEDDING_MODEL, limit);
    const known = await this.repo.embeddingsByHash(WIKI_EMBEDDING_MODEL, [
      ...new Set(chunks.map((chunk) => chunk.contentHash)),
    ]);
    const missing = [
      ...new Map(
        chunks.filter((chunk) => !known.has(chunk.contentHash)).map((chunk) => [chunk.contentHash, chunk]),
      ).values(),
    ];
    let calls = 0;
    let paused = false;
    for (let start = 0; start < missing.length; start += WIKI_EMBEDDING_BATCH_SIZE) {
      const batch = missing.slice(start, start + WIKI_EMBEDDING_BATCH_SIZE);
      const vectors = await this.embeddings.embedTexts(
        grant,
        batch.map((chunk) => chunk.text),
        "document",
      );
      calls += 1;
      if (!vectors) {
        paused = true;
        break;
      }
      batch.forEach((chunk, index) => known.set(chunk.contentHash, embeddingVectorLiteral(vectors[index])));
    }
    await this.repo.storeChunkEmbeddings(
      WIKI_EMBEDDING_MODEL,
      chunks.flatMap((chunk) => {
        const embedding = known.get(chunk.contentHash);
        return embedding ? [{ id: chunk.id, embedding }] : [];
      }),
    );
    const complete = !paused && (await this.repo.markFileEmbedded(fileId, WIKI_EMBEDDING_MODEL));
    return { calls, complete, paused };
  }
}
