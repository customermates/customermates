import type { SyncStaleWikiSectionsRepo } from "./sync-stale-wiki-sections.repo";

import { SystemInteractor } from "@/core/decorators/system-interactor.decorator";

export const WIKI_SECTION_CRON_PAGE_BUDGET = 5000;
export const WIKI_SECTION_CRON_BATCH_PAGES = 200;
export const WIKI_SECTION_CRON_TIME_BUDGET_MS = 120_000;

@SystemInteractor
export class SyncStaleWikiSectionsInteractor {
  constructor(private repo: SyncStaleWikiSectionsRepo) {}

  async invoke(
    args: { pageBudget?: number; batchPages?: number; timeBudgetMs?: number } = {},
  ): Promise<{ synced: number; companies: number; remaining: boolean }> {
    const batchPages = args.batchPages ?? WIKI_SECTION_CRON_BATCH_PAGES;
    const deadline = Date.now() + (args.timeBudgetMs ?? WIKI_SECTION_CRON_TIME_BUDGET_MS);
    let budget = args.pageBudget ?? WIKI_SECTION_CRON_PAGE_BUDGET;
    let synced = 0;
    let companies = 0;
    let remaining = false;

    const companyIds = await this.repo.findCompaniesWithStaleSectionsUnscoped(budget + 1);
    for (const companyId of companyIds) {
      if (budget <= 0 || Date.now() >= deadline) {
        remaining = true;
        break;
      }
      companies += 1;
      let companyRemaining = true;
      while (companyRemaining && budget > 0 && Date.now() < deadline) {
        const limit = Math.min(batchPages, budget);
        const result = await this.repo.syncStaleSectionsUnscoped(companyId, limit);
        synced += result.synced;
        budget -= limit;
        companyRemaining = result.remaining;
      }
      if (companyRemaining) remaining = true;
    }

    return { synced, companies, remaining };
  }
}
