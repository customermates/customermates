import type { BackgroundTaskService } from "@/core/utils/background-task.service";

import * as Sentry from "@sentry/node";

import { UserAccessor } from "@/core/base/user-accessor";
import type { SearchCatalogIndexScheduler } from "@/features/command-palette/search-catalog-index-scheduler";

import { isWikiSemanticSearchAvailable } from "./wiki-embedding.service";

const scheduledFingerprints = new Map<string, string>();

export class SearchCatalogIndexDispatcher extends UserAccessor implements SearchCatalogIndexScheduler {
  constructor(private backgroundTaskService: BackgroundTaskService) {
    super();
  }

  async schedule(fingerprint: string): Promise<void> {
    if (!isWikiSemanticSearchAvailable()) return;
    const key = `${this.companyId}\u0000${this.userId}`;
    if (scheduledFingerprints.get(key) === fingerprint) return;
    scheduledFingerprints.set(key, fingerprint);
    try {
      await this.backgroundTaskService.dispatch("index-search-catalog", { userId: this.userId });
    } catch (error) {
      scheduledFingerprints.delete(key);
      Sentry.captureException(error);
    }
  }
}
