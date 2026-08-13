import type { RootStore } from "@/core/stores/root.store";
import type { ActivityScope } from "@/ee/messaging/activities/activity-scope.schema";
import type { GetQueryParams, Filter } from "@/core/base/base-get.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { ActivitiesResult, ActivityEntryDto, ActivityKind } from "@/ee/messaging/activities/activities.schema";
import type { ActivitiesPageSize } from "./activities-paging";
import type { EntityType } from "@/generated/prisma";

import { action, makeObservable, observable, runInAction } from "mobx";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { getActivitiesAction } from "@/app/[locale]/(protected)/actions";
import { ACTIVITIES_PAGE_SIZE, computeHasMore } from "./activities-paging";
import { activityEntryKey } from "./activity-entry-key";
import { ActivityFiltersSchema } from "@/ee/messaging/activities/activities.schema";

export const ACTIVITIES_P13N_ID = "entity-timeline";

export type ActivitiesStoreOptions = {
  scope?: ActivityScope;
  defaultP13nId?: string;
  pageSize?: ActivitiesPageSize;
};

export class ActivitiesStore extends BaseDataViewStore<ActivityEntryDto> {
  readonly scope: ActivityScope | undefined;
  readonly defaultP13nId?: string;
  readonly pageSize: ActivitiesPageSize;
  loading = false;
  availableSources: ActivityKind[] = [];
  pageLimitReached = false;
  scopeTruncated = false;
  hasMore = false;
  page = 1;
  olderPageError = false;
  private pageGeneration = 0;

  constructor(rootStore: RootStore, options: ActivitiesStoreOptions) {
    super(rootStore);

    this.scope = options.scope;
    this.defaultP13nId = options.defaultP13nId;
    this.pageSize = options.pageSize ?? ACTIVITIES_PAGE_SIZE;

    makeObservable(this, {
      loading: observable,
      availableSources: observable,
      pageLimitReached: observable,
      scopeTruncated: observable,
      hasMore: observable,
      page: observable,
      olderPageError: observable,
      hydrate: action,
      applyFilters: action,
      loadOlder: action,
    });
  }

  get columnsDefinition(): TableColumn[] {
    return [];
  }

  hydrate = (initial: ActivitiesResult) => {
    this.setItems(initial);
  };

  override setItems(args: GetResult<ActivityEntryDto>): void {
    super.setItems(args);

    const activity = args as GetResult<ActivityEntryDto> & Partial<ActivitiesResult>;

    this.pageGeneration += 1;
    this.loading = false;
    this.olderPageError = false;
    this.page = 1;
    this.availableSources = activity.availableSources ?? [];
    this.pageLimitReached = activity.pageLimitReached ?? false;
    this.scopeTruncated = activity.scopeTruncated ?? false;
    this.hasMore = computeHasMore(activity, 1, this.pageSize);
  }

  applyFilters = async (filters: Filter[]): Promise<void> => {
    runInAction(() => {
      this.filters = filters;
    });

    await (this.isReady ? this.refreshQuery() : this.refresh());
  };

  coversEntity = (entityType: EntityType, entityId: string): boolean => {
    if (!this.scope) return true;

    const recordScope = (this.scope.records ?? []).find((record) => record.entityType === entityType);
    if (recordScope) return recordScope.ids.includes(entityId);

    return (this.scope.entityTypes ?? []).includes(entityType);
  };

  refreshFor = (entityType: EntityType, entityId: string): void => {
    if (!this.coversEntity(entityType, entityId)) return;

    void this.refresh().catch(() => this.toastError("Common.notifications.unexpectedError"));
  };

  private async fetchPage(extra: { filters?: Filter[]; p13nId?: string; page: number }) {
    const filters = extra.filters ? ActivityFiltersSchema.parse(extra.filters) : undefined;
    const effectiveP13nId = extra.p13nId ?? this.p13nId ?? this.defaultP13nId;
    return getActivitiesAction({
      scope: this.scope,
      filters,
      p13nId: effectiveP13nId,
      pagination: { page: extra.page, pageSize: this.pageSize },
    });
  }

  protected async refreshAction(params?: GetQueryParams): Promise<GetResult<ActivityEntryDto>> {
    runInAction(() => {
      this.loading = false;
    });

    const response = await this.fetchPage({
      filters: params?.filters,
      p13nId: params?.p13nId ?? this.p13nId ?? this.defaultP13nId,
      page: 1,
    }).catch(() => null);

    if (!response?.ok) throw new Error("Activities refresh failed");

    return response.data;
  }

  loadOlder = async (): Promise<void> => {
    if (this.loading || !this.hasMore) return;

    const nextPage = this.page + 1;
    const generation = this.pageGeneration;

    runInAction(() => {
      this.loading = true;
    });

    const response = await this.fetchPage({
      filters: this.filters,
      p13nId: this.p13nId ?? this.defaultP13nId,
      page: nextPage,
    }).catch(() => null);

    runInAction(() => {
      if (generation !== this.pageGeneration) return;
      this.loading = false;
      if (!response?.ok) {
        this.olderPageError = true;
        return;
      }

      const data = response.data;
      this.olderPageError = false;
      this.availableSources = data.availableSources;
      this.pageLimitReached = data.pageLimitReached;
      this.scopeTruncated = data.scopeTruncated;
      const existing = new Set(this.items.map(activityEntryKey));
      const fresh = data.items.filter((entry) => !existing.has(activityEntryKey(entry)));
      this.items = [...this.items, ...fresh];
      this.page = nextPage;
      this.hasMore = computeHasMore(data, nextPage, this.pageSize);
    });
  };
}
