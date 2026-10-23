import equal from "fast-deep-equal/es6";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { Filter, GetQueryParams } from "@/core/base/base-get.schema";
import type { RecordRow } from "@/features/records/record-presentation";
import type { RootStore } from "@/core/stores/root.store";
import { RecordsStore } from "./records.store";

export class RecordExplorationStore extends RecordsStore {
  private readonly scope: Filter[];
  private readonly initialLayout: string;

  constructor(root: RootStore, presentation: RecordPresentationResult, scope: Filter[] = []) {
    super(root, presentation);
    this.scope = scope;
    this.setItems(presentation.result);
    this.initialLayout = this.layoutKey;
  }
  get scopeFilters() {
    return this.scope;
  }
  get hasLayoutChanges() {
    return this.layoutKey !== this.initialLayout;
  }
  private get layoutKey() {
    return JSON.stringify([
      this.columnOrder,
      this.hiddenColumns,
      this.sortDescriptor,
      this.grouping,
      this.showRecordPictures,
    ]);
  }
  protected override canPersistViewState() {
    return false;
  }
  protected override refreshAction(params?: GetQueryParams) {
    return super.refreshAction({ ...params, filters: [...(this.scope ?? []), ...(params?.filters ?? [])] });
  }
  override setItems(result: GetResult<RecordRow>) {
    super.setItems({
      ...result,
      filters: result.filters?.filter((filter) => !(this.scope ?? []).some((scoped) => equal(scoped, filter))),
      p13nId: undefined,
      views: [],
      activeViewKey: ALL_VIEW_KEY,
      viewPersistable: false,
    });
  }
  override get supportsSelection() {
    return false;
  }
  override get supportsBoard() {
    return false;
  }
}
