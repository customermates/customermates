import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { WikiSemanticIndexScheduler } from "@/features/wiki/wiki-semantic-index-scheduler";
import type { WikiEmbeddingService } from "./wiki-embedding.service";
import type { WikiSemanticIndexRepo } from "@/ee/wiki-retrieval/wiki-semantic-index.repo";

import * as Sentry from "@sentry/node";

import { UserAccessor } from "@/core/base/user-accessor";

const WIKI_SEARCH_SCHEDULE_INTERVAL_MS = 60_000;
const lastSearchSchedule = new Map<string, number>();

export class WikiSemanticIndexDispatcher extends UserAccessor implements WikiSemanticIndexScheduler {
  constructor(
    private repo: WikiSemanticIndexRepo,
    private embeddings: WikiEmbeddingService,
    private backgroundTaskService: BackgroundTaskService,
    private trigger: "write" | "search",
  ) {
    super();
  }

  async schedule(): Promise<void> {
    const now = Date.now();
    if (
      this.trigger === "search" &&
      now - (lastSearchSchedule.get(this.companyId) ?? 0) < WIKI_SEARCH_SCHEDULE_INTERVAL_MS
    )
      return;
    try {
      if (!(await this.repo.semanticIndexAvailable())) return;
      if (!(await this.embeddings.authorizeIndexing(this.companyId))) return;
      if (this.trigger === "search") lastSearchSchedule.set(this.companyId, now);
      await this.backgroundTaskService.dispatch("index-wiki-pages", { userId: this.userId });
    } catch (error) {
      Sentry.captureException(error);
    }
  }
}
