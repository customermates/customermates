import type { WikiSynthesisTopicProgress } from "./wiki-crawl-progress.schema";

export abstract class GetSetupKnowledgeProgressRepo {
  abstract findSetupKnowledgeProgress(): Promise<WikiSynthesisTopicProgress[] | null>;
}
