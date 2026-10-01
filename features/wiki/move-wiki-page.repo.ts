import type { MoveWikiPageData } from "./move-wiki-page.interactor";

export abstract class MoveWikiPageRepo {
  abstract movePage(data: MoveWikiPageData): Promise<"moved" | "not-found" | "pinned">;
}
