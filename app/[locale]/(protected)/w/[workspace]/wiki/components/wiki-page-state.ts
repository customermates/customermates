export type WikiPageState = "error" | "setup" | "empty" | "content";

type Input = {
  failed: boolean;
  hasPages: boolean;
  setupActive: boolean;
};

export function resolveWikiPageState({ failed, hasPages, setupActive }: Input): WikiPageState {
  if (failed) return "error";
  if (hasPages) return "content";
  return setupActive ? "setup" : "empty";
}

export type WikiSheetState = "closed" | "loading" | "error" | "page";

type SheetInput = {
  openId: string | null;
  loadedId: string | null;
  creating: boolean;
  awaiting: boolean;
  missing: boolean;
};

export function resolveWikiSheetState({ openId, loadedId, creating, awaiting, missing }: SheetInput): WikiSheetState {
  if (creating) return "page";
  if (awaiting) return loadedId ? "page" : "closed";
  if (openId === null) return "closed";
  if (missing) return "error";
  return loadedId === openId ? "page" : "loading";
}
