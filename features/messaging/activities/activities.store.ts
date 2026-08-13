import type { RootStore } from "@/core/stores/root.store";
import type { EntityType } from "@/generated/prisma";
import type { GetQueryParams, Filter } from "@/core/base/base-get.schema";
import type { GetResult } from "@/core/base/base-get.interactor";
import type { TableColumn } from "@/core/base/base-data-view.store";
import type { ActivitiesResult, ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

import { action, makeObservable, observable, runInAction } from "mobx";

import { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { getActivitiesAction } from "@/app/[locale]/(protected)/actions";

const PAGE_SIZE = 25;

export const ACTIVITIES_P13N_ID = "entity-timeline";

export class ActivitiesStore extends BaseDataViewStore<ActivityEntryDto> {
  timelineEntityType: EntityType | null = null;
  timelineEntityId = "";
  loading = false;
  hasMore = false;
  page = 1;

  constructor(rootStore: RootStore) {
    super(rootStore);
    makeObservable(this, {
      timelineEntityType: observable,
      timelineEntityId: observable,
      loading: observable,
      hasMore: observable,
      page: observable,
      init: action,
      loadOlder: action,
    });
  }

  get columnsDefinition(): TableColumn[] {
    return [];
  }

  init = (entityType: EntityType, entityId: string, initial: ActivitiesResult) => {
    this.timelineEntityType = entityType;
    this.timelineEntityId = entityId;
    this.page = 1;
    this.hasMore = computeHasMore(initial, 1);
    this.setItems(initial);
  };

  refreshFor = (entityId: string): void => {
    if (this.timelineEntityId !== entityId) return;
    void this.refresh().catch(() => this.toastError("Common.notifications.unexpectedError"));
  };

  private async fetchPage(extra: {
    filters?: Filter[];
    p13nId?: string;
    page: number;
  }): Promise<ActivitiesResult | null> {
    if (!this.timelineEntityType) return null;

    return getActivitiesAction({
      entityType: this.timelineEntityType,
      entityId: this.timelineEntityId,
      filters: extra.filters,
      p13nId: extra.p13nId,
      pagination: { page: extra.page, pageSize: PAGE_SIZE },
    });
  }

  protected async refreshAction(params?: GetQueryParams): Promise<GetResult<ActivityEntryDto>> {
    const data = await this.fetchPage({
      filters: params?.filters,
      p13nId: params?.p13nId ?? this.p13nId ?? ACTIVITIES_P13N_ID,
      page: 1,
    });

    if (!data) return { items: this.items };

    runInAction(() => {
      this.page = 1;
      this.hasMore = computeHasMore(data, 1);
    });

    return data;
  }

  loadOlder = async (): Promise<void> => {
    if (this.loading || !this.hasMore) return;

    const nextPage = this.page + 1;

    runInAction(() => {
      this.loading = true;
    });

    const data = await this.fetchPage({ filters: this.filters, page: nextPage });

    runInAction(() => {
      this.loading = false;
      if (!data) return;
      const existing = new Set(this.items.map((entry) => entry.id));
      const fresh = data.items.filter((entry) => !existing.has(entry.id));
      this.items = [...this.items, ...fresh];
      this.page = nextPage;
      this.hasMore = computeHasMore(data, nextPage);
    });
  };
}

function computeHasMore(result: GetResult<ActivityEntryDto>, page: number): boolean {
  if (result.pagination) return page * PAGE_SIZE < result.pagination.total;

  return result.items.length >= PAGE_SIZE;
}
