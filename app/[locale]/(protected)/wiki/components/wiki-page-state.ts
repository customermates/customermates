export type WikiPageState = "loading" | "error" | "setup" | "empty" | "content";

type Input = {
  isNavigating: boolean;
  missing: boolean;
  hasDocument: boolean;
  /** A website import is running and no Knowledge Base page exists yet; pages always win over setup progress. */
  setupActive: boolean;
};

export function resolveWikiPageState({ isNavigating, missing, hasDocument, setupActive }: Input): WikiPageState {
  if (isNavigating) return "loading";
  if (missing) return "error";
  if (hasDocument) return "content";
  return setupActive ? "setup" : "empty";
}
