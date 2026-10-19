import type {
  ProposeWikiPageChangesData,
  ProposeWikiPageChangesRepoResult,
} from "./propose-wiki-page-changes.interactor";

export abstract class ProposeWikiPageChangesRepo {
  abstract proposeChanges(data: ProposeWikiPageChangesData): Promise<ProposeWikiPageChangesRepoResult>;
}
