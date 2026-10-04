import type { UpdateWikiPageData, UpdateWikiPageRepoResult } from "./update-wiki-page.interactor";

export abstract class UpdateWikiPageRepo {
  abstract updatePage(data: UpdateWikiPageData): Promise<UpdateWikiPageRepoResult>;
}
