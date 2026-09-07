import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { DataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import type { DataViewChipDto, DataViewState } from "@/core/data-view/data-view-state.schema";

import { toJS } from "mobx";

import { deleteDataViewAction, upsertDataViewAction } from "@/app/actions";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";

import { sortViewsByPosition } from "./view-rail-model";

type UpsertResult = Awaited<ReturnType<typeof upsertDataViewAction>>;

export function currentViewState<E extends HasId>(store: BaseDataViewStore<E>): DataViewState {
  return {
    columnOrder: toJS(store.columnOrder),
    columnWidths: toJS(store.columnWidths),
    filters: toJS(store.filters) ?? [],
    grouping: toJS(store.grouping) ?? null,
    hiddenColumns: toJS(store.hiddenColumns),
    pageSize: store.pagination?.pageSize,
    searchTerm: store.searchTerm ?? "",
    sortDescriptor: toJS(store.sortDescriptor) ?? null,
    viewMode: toJS(store.viewMode),
  };
}

export function surfaceKeyOf<E extends HasId>(store: BaseDataViewStore<E>): DataViewSurfaceKey {
  return store.p13nId as DataViewSurfaceKey;
}

export function viewHref(pathname: string, viewKey: string): string {
  return viewKey === ALL_VIEW_KEY ? pathname : `${pathname}?view=${encodeURIComponent(viewKey)}`;
}

export function viewLink(pathname: string, viewKey: string): string {
  return new URL(viewHref(pathname, viewKey), window.location.origin).toString();
}

export function selectView<E extends HasId>(store: BaseDataViewStore<E>, viewKey: string, pathname: string): void {
  store.applyView(viewKey);
  window.history.pushState(null, "", viewHref(pathname, viewKey));
}

function unwrap(result: UpsertResult): DataViewChipDto | null {
  if (result.ok) return result.data;

  toastZodErrorTree(result.error);
  return null;
}

export async function createViewFromCurrent<E extends HasId>(
  store: BaseDataViewStore<E>,
  args: { name: string },
): Promise<DataViewChipDto | null> {
  const created = unwrap(
    await upsertDataViewAction({
      name: args.name,
      state: currentViewState(store),
      surfaceKey: surfaceKeyOf(store),
    }),
  );
  if (!created) return null;

  await store.refresh();
  return created;
}

export async function duplicateView<E extends HasId>(
  store: BaseDataViewStore<E>,
  source: DataViewChipDto,
  args: { name: string },
): Promise<DataViewChipDto | null> {
  const copy = unwrap(
    await upsertDataViewAction({
      name: args.name,
      state: toJS(source.state),
      surfaceKey: surfaceKeyOf(store),
    }),
  );
  if (!copy) return null;

  await store.refresh();
  return copy;
}

export async function updateViewMeta<E extends HasId>(
  store: BaseDataViewStore<E>,
  view: DataViewChipDto,
  changes: { name?: string; position?: number },
): Promise<boolean> {
  const updated = unwrap(
    await upsertDataViewAction({
      id: view.id,
      name: changes.name ?? view.name,
      position: changes.position,
      state: view.id === store.activeViewKey ? currentViewState(store) : toJS(view.state),
      surfaceKey: surfaceKeyOf(store),
    }),
  );

  return Boolean(updated);
}

export async function moveView<E extends HasId>(
  store: BaseDataViewStore<E>,
  view: DataViewChipDto,
  offset: -1 | 1,
): Promise<boolean> {
  const ordered = sortViewsByPosition(store.views);
  const neighbour = ordered[ordered.findIndex((candidate) => candidate.id === view.id) + offset];
  if (!neighbour) return false;

  if (!(await updateViewMeta(store, view, { position: neighbour.position }))) return false;
  if (!(await updateViewMeta(store, neighbour, { position: view.position }))) return false;

  await store.refresh();
  return true;
}

export async function deleteView<E extends HasId>(
  store: BaseDataViewStore<E>,
  view: DataViewChipDto,
): Promise<boolean> {
  const isActive = store.activeViewKey === view.id;
  if (isActive) store.discardPendingViewState();

  const result = await deleteDataViewAction({ id: view.id });
  if (!result.ok) {
    toastZodErrorTree(result.error);
    return false;
  }

  if (isActive) store.applyView(ALL_VIEW_KEY);
  else await store.refresh();

  return true;
}
