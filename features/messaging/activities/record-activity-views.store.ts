import { action, makeObservable, observable, runInAction, toJS } from "mobx";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import type { RecordActivityPresentation } from "@/ee/messaging/activities/get-record-activity-presentation.interactor";
import { BaseDataViewStore } from "@/core/base/base-data-view.store";
import {
  ACTIVITY_KINDS,
  CHANGE_ACTIVITY_KINDS,
  type ActivityEntryDto,
} from "@/ee/messaging/activities/activities.schema";
import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";
import type { RecordActivitiesInput } from "@/ee/messaging/activities/record-activities.schema";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
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
  private readonly owner: { userId: string; companyId: string } | undefined;
  initialView?: string;
  constructor(
    root: RootStore,
    private record: RecordRef | null,
    viewPathname?: string,
    viewSyncToUrl = false,
    initialView?: string,
  ) {
    super(root);
    this.initialView = initialView;
    if (initialView) {
      runInAction(() => {
        this.activeViewKey = initialView;
      });
    }
    const user = root.userStore?.user;
    this.owner = user ? { userId: user.id, companyId: user.companyId } : undefined;
    this.p13nId = SURFACE.entityTimeline;
    this.viewPathname = viewPathname;
    this.viewSyncToUrl = viewSyncToUrl;
    makeObservable(this, {
      columns: observable.ref,
      hasMore: observable,
      loading: observable,
      error: observable,
      load: action,
      followRequestedView: action,
    });
  }
  get columnsDefinition() {
    return [];
  }
  protected override get viewStateWriteOwner() {
    return this.owner ? JSON.stringify([this.owner.userId, this.owner.companyId]) : undefined;
  }
  protected override canPersistViewState() {
    const user = this.rootStore.userStore?.user;
    return Boolean(this.owner && user?.id === this.owner.userId && user.companyId === this.owner.companyId);
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
        scope: { records: this.record ? [this.record] : [], typeIds: [] },
        kinds: [...(this.record ? ACTIVITY_KINDS : CHANGE_ACTIVITY_KINDS)],
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
  followRequestedView = (viewKey: string | null) => {
    const key = viewKey ?? ALL_VIEW_KEY;
    if (this.disposed || key === this.activeViewKey) return;
    if (!this.isReady) {
      this.initialView = viewKey ?? undefined;
      this.activeViewKey = key;
      void this.load();
      return;
    }
    this.applyView(key);
  };
  dispose() {
    if (this.disposed) return;
    if (this.canPersistViewState()) void this.flushPendingViewState();
    else this.discardPendingViewState();
    this.disposed = true;
    this.generation += 1;
  }
}
