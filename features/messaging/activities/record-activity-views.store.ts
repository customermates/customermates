import { action, makeObservable, observable, runInAction, toJS } from "mobx";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RecordActivityPresentation } from "@/ee/messaging/activities/get-record-activity-presentation.interactor";
import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import { ACTIVITY_KINDS, type ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import type { RecordActivitiesInput } from "@/ee/messaging/activities/record-activities.schema";
import { SURFACE } from "@/core/data-view/data-view-keys";
import {
  getRecordActivityPresentationAction,
  getRecordActivitiesAction,
} from "@/app/[locale]/(protected)/records/actions";
import { activityViewFilters } from "@/ee/messaging/activities/record-activity-view";
import { activityEntryKey } from "./activity-entry-key";

export class RecordActivityViewsStore extends BaseDataViewStore<ActivityEntryDto> {
  columns: ColumnPresentation[] = [];
  hasMore = false;
  loading = false;
  error = false;
  private cursor: RecordActivitiesInput["cursor"] = null;
  private generation = 0;
  private loadGeneration = 0;
  private disposed = false;
  initialView?: string;
  constructor(
    root: RootStore,
    private record: RecordRef,
  ) {
    super(root);
    this.p13nId = SURFACE.entityTimeline;
    makeObservable(this, {
      columns: observable.ref,
      hasMore: observable,
      loading: observable,
      error: observable,
      load: action,
    });
  }
  get columnsDefinition() {
    return [];
  }
  override get filterColumns() {
    return this.columns;
  }
  override setItems(data: RecordActivityPresentation) {
    super.setItems(data);
    this.columns = data.columns;
    this.cursor = data.nextCursor;
    this.hasMore = Boolean(this.cursor);
    this.error = false;
  }
  protected override async refreshAction(params?: GetQueryParams) {
    this.generation += 1;
    return getRecordActivityPresentationAction({
      record: this.record,
      params: { ...params, viewId: params?.viewId ?? this.initialView },
    });
  }
  load = async (older = false) => {
    if (older && (this.loading || !this.cursor)) return;
    const request = ++this.loadGeneration;
    const generation = ++this.generation;
    this.loading = true;
    this.error = false;
    try {
      if (!older) {
        await this.refreshGuarded(() => !this.disposed);
        return;
      }
      const result = await getRecordActivitiesAction({
        scope: { records: [this.record], typeIds: [] },
        kinds: [...ACTIVITY_KINDS],
        filters: activityViewFilters(toJS(this.filters ?? [])),
        cursor: this.cursor,
        limit: 25,
      });
      if (!result.ok) throw new Error("Record activity request failed");
      if (generation !== this.generation) return;
      runInAction(() => {
        this.items = [
          ...new Map([...this.items, ...result.data.items].map((item) => [activityEntryKey(item), item])).values(),
        ];
        this.cursor = result.data.nextCursor;
        this.hasMore = Boolean(this.cursor);
      });
    } catch {
      runInAction(() => {
        if (!this.disposed && request === this.loadGeneration) this.error = true;
      });
    } finally {
      runInAction(() => {
        if (!this.disposed && request === this.loadGeneration) this.loading = false;
      });
    }
  };
  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.discardPendingViewState();
  }
}
