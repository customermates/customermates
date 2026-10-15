export abstract class RecordFileSemanticIndexer {
  abstract embedPending(): Promise<{ embedded: number; remaining: boolean }>;
}
