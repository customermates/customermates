import type { PruneWikiKnowledgeGapsRepo } from "./prune-wiki-knowledge-gaps.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

import { WIKI_KNOWLEDGE_GAP_RETENTION_DAYS } from "./wiki-knowledge-gaps";

@SystemInteractor
export class PruneWikiKnowledgeGapsInteractor {
  constructor(private repo: PruneWikiKnowledgeGapsRepo) {}

  async invoke(args: { now?: Date } = {}): Promise<{ pruned: number }> {
    const now = args.now ?? new Date();
    const before = new Date(now.getTime() - WIKI_KNOWLEDGE_GAP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    return { pruned: await this.repo.deleteKnowledgeGapsUnscoped(before) };
  }
}
