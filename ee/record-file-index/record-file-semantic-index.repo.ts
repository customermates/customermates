export type UnembeddedRecordFileChunk = { id: string; contentHash: string; text: string };

export abstract class RecordFileSemanticIndexRepo {
  abstract semanticIndexAvailable(): Promise<boolean>;
  abstract claimUnembeddedFiles(model: string, limit: number): Promise<string[]>;
  abstract unembeddedChunks(fileId: string, model: string, limit: number): Promise<UnembeddedRecordFileChunk[]>;
  abstract embeddingsByHash(model: string, contentHashes: string[]): Promise<Map<string, string>>;
  abstract storeChunkEmbeddings(model: string, embeddings: Array<{ id: string; embedding: string }>): Promise<void>;
  abstract markFileEmbedded(fileId: string, model: string): Promise<boolean>;
  abstract releaseFileClaims(fileIds: string[]): Promise<void>;
}
