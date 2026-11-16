export type WikiPageState = "loading" | "error" | "setup" | "empty" | "graph" | "content";

type Input = {
  isNavigating: boolean;
  missing: boolean;
  hasDocument: boolean;
  setupActive: boolean;
  showGraph?: boolean;
};

export function resolveWikiPageState({
  isNavigating,
  missing,
  hasDocument,
  setupActive,
  showGraph = false,
}: Input): WikiPageState {
  if (isNavigating) return "loading";
  if (missing) return "error";
  if (showGraph) return "graph";
  if (hasDocument) return "content";
  return setupActive ? "setup" : "empty";
}
