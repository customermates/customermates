import type { WikiKnowledgeGap } from "./wiki.schema";

export abstract class GetWikiKnowledgeGapsRepo {
  abstract listKnowledgeGaps(limit: number): Promise<WikiKnowledgeGap[]>;
}
