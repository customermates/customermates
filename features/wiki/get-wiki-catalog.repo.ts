import type { WikiCatalogInput, WikiPageDto } from "./wiki.schema";

export type WikiCatalogPage = WikiPageDto & { summary?: string | null };

export abstract class GetWikiCatalogRepo {
  abstract listCatalogPages(data: WikiCatalogInput): Promise<{ items: WikiCatalogPage[]; total: number }>;
  abstract loadOperatingPages(procedureLimit: number): Promise<{
    guide: WikiPageDto | null;
    procedures: WikiCatalogPage[];
    proceduresTotal: number;
  }>;
}
