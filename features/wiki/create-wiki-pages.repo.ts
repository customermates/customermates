import type { CreateWikiPagesRepoData, CreateWikiPagesRepoResult } from "./create-wiki-pages.interactor";

export abstract class CreateWikiPagesRepo {
  abstract createPages(data: CreateWikiPagesRepoData): Promise<CreateWikiPagesRepoResult>;
}
