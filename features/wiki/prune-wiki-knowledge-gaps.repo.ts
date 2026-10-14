export abstract class PruneWikiKnowledgeGapsRepo {
  abstract deleteKnowledgeGapsUnscoped(lastSeenBefore: Date): Promise<number>;
}
