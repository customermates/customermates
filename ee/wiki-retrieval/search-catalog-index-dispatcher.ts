import type { BackgroundTaskService } from "@/core/utils/background-task.service";
import type { SearchCatalogIndexScheduler } from "@/features/command-palette/search-catalog-index-scheduler";

import * as Sentry from "@sentry/node";

import { UserAccessor } from "@/core/base/user-accessor";

import { isWikiSemanticSearchAvailable } from "./wiki-embedding.service";

const SEARCH_CATALOG_REDISPATCH_MS = 600_000;
const lastDispatch = new Map<string, number>();

export class SearchCatalogIndexDispatcher extends UserAccessor implements SearchCatalogIndexScheduler {
  constructor(private backgroundTaskService: BackgroundTaskService) {
    super();
  }

  async schedule(fingerprint: string): Promise<void> {
    if (!isWikiSemanticSearchAvailable()) return;
    const key = `${this.companyId}\u0000${fingerprint}`;
    const now = Date.now();
    if (now - (lastDispatch.get(key) ?? 0) < SEARCH_CATALOG_REDISPATCH_MS) return;
    lastDispatch.set(key, now);
    try {
      await this.backgroundTaskService.dispatch("index-search-catalog", { userId: this.userId });
    } catch (error) {
      lastDispatch.delete(key);
      Sentry.captureException(error);
    }
  }
}
