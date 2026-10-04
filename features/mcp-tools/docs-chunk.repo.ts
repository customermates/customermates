import type { DocsCorpus } from "./docs-corpus";
import type { FullTextUnit } from "@/core/retrieval/full-text-query";
import type {
  DocsScope,
  DocsFullTextRow,
  DocsSemanticRow,
  DocsStoredBuild,
  DocsPendingChunk,
} from "./prisma-docs-chunk.repository";

export abstract class DocsChunkRepo {
  abstract ensureCorpus(corpus: DocsCorpus): Promise<void>;
  abstract storedBuild(corpus: DocsCorpus): Promise<DocsStoredBuild | null>;
  abstract fullTextSections(
    scope: DocsScope,
    units: readonly FullTextUnit[],
    limit: number,
  ): Promise<DocsFullTextRow[]>;
  abstract semanticSections(
    scope: DocsScope,
    vector: number[],
    model: string,
    limit: number,
  ): Promise<DocsSemanticRow[] | null>;
  abstract semanticIndexAvailable(): Promise<boolean>;
  abstract semanticIndexComplete(scope: DocsScope, model: string): Promise<boolean>;
  abstract pendingEmbeddings(buildHash: string, model: string, limit: number): Promise<DocsPendingChunk[]>;
  abstract storeEmbeddings(model: string, rows: Array<{ contentHash: string; embedding: string }>): Promise<void>;
}
