export abstract class WikiKnowledgeGapRecorder {
  abstract record(query: string): Promise<void>;
}
