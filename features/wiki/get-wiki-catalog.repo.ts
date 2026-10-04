import type { WikiCatalogInput, WikiPageDto } from "./wiki.schema";

export abstract class GetWikiCatalogRepo {
  abstract listCatalogPages(data: WikiCatalogInput): Promise<{ items: WikiPageDto[]; total: number }>;
  abstract loadOperatingPages(procedureLimit: number): Promise<{
    guide: WikiPageDto | null;
    procedures: WikiPageDto[];
    proceduresTotal: number;
  }>;
}
