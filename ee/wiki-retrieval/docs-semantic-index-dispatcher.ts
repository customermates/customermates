import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { DocsChunkRepo } from "@/features/mcp-tools/docs-chunk.repo";
import * as Sentry from "@sentry/node";
import { isWikiSemanticSearchAvailable } from "./wiki-embedding.service";
import { WIKI_EMBEDDING_MODEL } from "./wiki-embedding-model";
const DOCS_INDEX_SCHEDULE_INTERVAL_MS = 60_000;
let lastSchedule = 0;

export class DocsSemanticIndexDispatcher {
  constructor(
    private repo: DocsChunkRepo,
    private backgroundTaskService: BackgroundTaskService,
  ) {}

  async schedule(buildHash: string, seeded: boolean): Promise<void> {
    const now = Date.now();
    if (now - lastSchedule < DOCS_INDEX_SCHEDULE_INTERVAL_MS) return;
    lastSchedule = now;
    try {
      if (seeded) {
        if (!isWikiSemanticSearchAvailable() || !(await this.repo.semanticIndexAvailable())) return;
        if ((await this.repo.pendingEmbeddings(buildHash, WIKI_EMBEDDING_MODEL, 1)).length === 0) return;
      }
      await this.backgroundTaskService.dispatch("index-docs-chunks", {});
    } catch (error) {
      Sentry.captureException(error);
    }
  }
}
