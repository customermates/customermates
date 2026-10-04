import type { WikiPageDto } from "./wiki.schema";

export abstract class GetWikiPageRepo {
  abstract getPage(id: string): Promise<WikiPageDto | null>;
}
