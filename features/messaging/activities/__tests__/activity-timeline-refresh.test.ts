import type { RootStore } from "@/core/stores/root.store";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { BaseDataViewStore } from "@/core/base/base-data-view.store";

import { ActivityTimelineRegistry } from "@/core/stores/activity-timeline.registry";

import { ActivitiesStore } from "../activities.store";

const { getActivitiesAction } = vi.hoisted(() => ({
  getActivitiesAction: vi.fn(),
}));

vi.mock("@/app/[locale]/(protected)/actions", () => ({ getActivitiesAction }));
vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

const cleanups: Array<() => void> = [];
const activityTimelines = new ActivityTimelineRegistry();
const rootStore = { activityTimelines } as unknown as RootStore;

class ContactEntityStore extends BaseDataViewStore<{ id: string }> {
  constructor() {
    super(rootStore, undefined, EntityType.contact);
  }

  get columnsDefinition() {
    return [];
  }
}

function mount(store: ActivitiesStore) {
  activityTimelines.register(store);
  cleanups.push(() => activityTimelines.unregister(store));
  return store;
}

beforeEach(() => vi.clearAllMocks());

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.restoreAllMocks();
});

describe("activity timeline refresh registry", () => {
  it("refreshes each matching store once for a large mutation batch", async () => {
    getActivitiesAction.mockResolvedValue({
      ok: true,
      data: {
        availableSources: ["audit"],
        items: [],
        pageLimitReached: false,
        scopeTruncated: false,
      },
    });
    const ids = Array.from({ length: 100 }, (_, index) => `record-${index}`);
    mount(new ActivitiesStore(rootStore, {}));
    mount(
      new ActivitiesStore(rootStore, {
        scope: { entityTypes: [EntityType.deal] },
      }),
    );
    mount(
      new ActivitiesStore(rootStore, {
        scope: { records: [{ entityType: EntityType.deal, ids: [ids[75]] }] },
      }),
    );
    mount(
      new ActivitiesStore(rootStore, {
        scope: { entityTypes: [EntityType.task] },
      }),
    );

    activityTimelines.refreshForMany(EntityType.deal, ids);

    await vi.waitFor(() => expect(getActivitiesAction).toHaveBeenCalledTimes(3));
  });

  it("stops refreshing a store after it is unregistered", async () => {
    const store = new ActivitiesStore(rootStore, {});
    activityTimelines.register(store);

    activityTimelines.unregister(store);
    activityTimelines.refreshForMany(EntityType.contact, ["record-1"]);

    await Promise.resolve();
    expect(getActivitiesAction).not.toHaveBeenCalled();
  });

  it("refreshes message-only timelines because entity mutations can change membership and presentation", async () => {
    getActivitiesAction.mockResolvedValue({
      ok: true,
      data: {
        availableSources: ["message"],
        items: [],
        pageLimitReached: false,
        scopeTruncated: false,
      },
    });
    const store = mount(new ActivitiesStore(rootStore, {}));
    store.hydrate({
      availableSources: ["audit", "message"],
      items: [],
      pageLimitReached: false,
      scopeTruncated: false,
      filters: [
        {
          field: FilterFieldKey.timelineKind,
          operator: FilterOperatorKey.in,
          value: ["messages"],
        },
      ],
    });

    activityTimelines.refreshForMany(EntityType.contact, ["record-1"]);

    await vi.waitFor(() => expect(getActivitiesAction).toHaveBeenCalledOnce());
  });

  it("refreshes registered timelines when an entity store upserts a modal result", async () => {
    getActivitiesAction.mockResolvedValue({
      ok: true,
      data: {
        availableSources: ["message"],
        items: [],
        pageLimitReached: false,
        scopeTruncated: false,
      },
    });
    const timeline = mount(new ActivitiesStore(rootStore, {}));
    timeline.hydrate({
      availableSources: ["message"],
      items: [],
      pageLimitReached: false,
      scopeTruncated: false,
      filters: [
        {
          field: FilterFieldKey.timelineKind,
          operator: FilterOperatorKey.in,
          value: ["messages"],
        },
      ],
    });

    await new ContactEntityStore().upsertItem({ id: "record-1" });

    await vi.waitFor(() => expect(getActivitiesAction).toHaveBeenCalledOnce());
  });
});
