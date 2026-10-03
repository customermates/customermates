import type { WikiHomepageSetupTurn } from "./get-wiki-homepage-setup-state.interactor";

export abstract class GetWikiHomepageSetupTurnRepo {
  abstract findWikiHomepageSetupTurn(): Promise<WikiHomepageSetupTurn | null>;
}
