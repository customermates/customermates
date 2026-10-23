import type { DataViewState } from "./data-view-state.schema";

type ViewQuery = { filters?: readonly unknown[]; searchTerm?: string };

export function allViewLayout<S extends DataViewState>(state: S): Omit<S, "filters" | "searchTerm"> {
  const layout: S = { ...state };
  delete layout.filters;
  delete layout.searchTerm;
  return layout;
}

export function carriesViewQuery(state: ViewQuery): boolean {
  return (state.filters?.length ?? 0) > 0 || Boolean(state.searchTerm?.trim());
}
