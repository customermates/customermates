import type { WikiSectionSync } from "./search-wiki-pages.repo";

export abstract class SyncStaleWikiSectionsRepo {
  abstract findCompaniesWithStaleSectionsUnscoped(limit: number): Promise<string[]>;
  abstract syncStaleSectionsUnscoped(companyId: string, limit: number): Promise<WikiSectionSync>;
}
