import type { DocsCorpus } from "./docs-corpus";
import type { FullTextUnit } from "@/core/retrieval/full-text-query";
import type {
  DocsScope,
  DocsFullTextRow,
  DocsSemanticRow,
  DocsStoredBuild,
  DocsPendingPart,
} from "./prisma-docs-section.repository";

export abstract class DocsSectionRepo {
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
    version: string,
    limit: number,
  ): Promise<DocsSemanticRow[] | null>;
  abstract semanticIndexAvailable(): Promise<boolean>;
  abstract semanticIndexComplete(scope: DocsScope, version: string): Promise<boolean>;
  abstract pendingEmbeddings(buildHash: string, version: string, limit: number): Promise<DocsPendingPart[]>;
  abstract storeEmbeddings(version: string, rows: Array<{ contentHash: string; embedding: string }>): Promise<void>;
}
