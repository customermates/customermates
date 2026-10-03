import type { DeleteWikiPageData, DeleteWikiPageRepoResult } from "./delete-wiki-page.interactor";

export abstract class DeleteWikiPageRepo {
  abstract deletePage(data: DeleteWikiPageData): Promise<DeleteWikiPageRepoResult>;
}
