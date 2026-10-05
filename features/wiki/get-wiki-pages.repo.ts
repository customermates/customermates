import type { WikiPageListData, WikiPageListResult } from "./wiki.schema";

export abstract class GetWikiPagesRepo {
  abstract listPages(data: WikiPageListData): Promise<WikiPageListResult>;
}
