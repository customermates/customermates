import type { RootStore } from "@/core/stores/root.store";
import type { ActivityEntryDto, ActivitiesResult } from "@/ee/messaging/activities/activities.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

const { getActivitiesAction, toastError } = vi.hoisted(() => ({
  getActivitiesAction: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
vi.mock("@/app/[locale]/(protected)/actions", () => ({ getActivitiesAction }));
vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

import { ActivitiesStore } from "../activities.store";

const rootStore = {} as RootStore;
const toastingRootStore = {
  localeStore: { getTranslation: (key: string) => key },
  loadingOverlayStore: { isLoading: false },
} as unknown as RootStore;
const contactScope = (id: string) => ({ records: [{ entityType: EntityType.contact, ids: [id] }] });
const entry = (kind: ActivityEntryDto["kind"], id: string) => ({ id, kind }) as ActivityEntryDto;
const result = (
  items: ActivityEntryDto[],
  options: {
    availableSources?: ActivitiesResult["availableSources"];
    pageLimitReached?: boolean;
    scopeTruncated?: boolean;
    total?: number;
  } = {},
): ActivitiesResult => ({
  availableSources: options.availableSources ?? ["audit", "message", "activity", "calendar_event"],
  items,
  pageLimitReached: options.pageLimitReached ?? false,
  pagination: {
    page: 1,
    pageSize: 25,
    total: options.total ?? items.length,
    totalPages: 1,
  },
  scopeTruncated: options.scopeTruncated ?? false,
});

describe("ActivitiesStore", () => {
  beforeEach(() => vi.clearAllMocks());

  it("matches unscoped, whole-type, and exact-record mutations without broadening narrowed types", () => {
    const unscoped = new ActivitiesStore(rootStore, {});
    const typeScoped = new ActivitiesStore(rootStore, {
      scope: { entityTypes: [EntityType.deal] },
    });
    const recordScoped = new ActivitiesStore(rootStore, {
      scope: {
        entityTypes: [EntityType.deal],
        records: [
          {
            entityType: EntityType.deal,
            ids: ["00000000-0000-4000-8000-000000000001"],
          },
        ],
      },
    });

    expect(unscoped.coversEntity(EntityType.task, "any")).toBe(true);
    expect(typeScoped.coversEntity(EntityType.deal, "any")).toBe(true);
    expect(typeScoped.coversEntity(EntityType.task, "any")).toBe(false);
    expect(recordScoped.coversEntity(EntityType.deal, "00000000-0000-4000-8000-000000000001")).toBe(true);
    expect(recordScoped.coversEntity(EntityType.deal, "00000000-0000-4000-8000-000000000002")).toBe(false);
  });

  it("keeps same-id entries from different sources while loading older activity", async () => {
    const store = new ActivitiesStore(rootStore, {});
    store.hydrate(result([entry("audit", "same")], { total: 50 }));
    getActivitiesAction.mockResolvedValue({
      ok: true,
      data: result([entry("audit", "same"), entry("message", "same")], {
        total: 50,
      }),
    });

    await store.loadOlder();

    expect(store.items.map(({ kind }) => kind)).toEqual(["audit", "message"]);
  });

  it("retains source availability and page-limit state from activity results", async () => {
    const store = new ActivitiesStore(rootStore, {});
    store.hydrate(result([], { availableSources: ["audit"], pageLimitReached: true }));

    expect(store.availableSources).toEqual(["audit"]);
    expect(store.pageLimitReached).toBe(true);

    getActivitiesAction.mockResolvedValue({
      ok: true,
      data: result([], {
        availableSources: ["message", "activity", "calendar_event"],
      }),
    });
    await store.applyFilters([]);

    expect(store.availableSources).toEqual(["message", "activity", "calendar_event"]);
    expect(store.pageLimitReached).toBe(false);
  });

  it("records a failed refresh as refresh-error and retains the rows already shown", async () => {
    const store = new ActivitiesStore(rootStore, {});
    store.hydrate(result([entry("audit", "kept")]));
    getActivitiesAction.mockResolvedValue({ ok: false, error: {} });

    await expect(store.applyFilters([])).rejects.toThrow();

    expect(store.dataRequest.status).toBe("refresh-error");
    expect(store.items.map(({ id }) => id)).toEqual(["kept"]);
  });

  it("marks replacement filters as pending until their rows are committed", async () => {
    const store = new ActivitiesStore(rootStore, {});
    store.hydrate(result([entry("audit", "old")]));
    let resolveRequest: (value: unknown) => void = () => undefined;
    getActivitiesAction.mockImplementation(() => new Promise((resolve) => (resolveRequest = resolve)));

    const refresh = store.applyFilters([
      {
        field: FilterFieldKey.timelineKind,
        operator: FilterOperatorKey.in,
        value: ["message"],
      },
    ]);

    expect(store.isRefreshing).toBe(true);
    expect(store.items.map(({ id }) => id)).toEqual(["old"]);

    resolveRequest({ ok: true, data: result([entry("message", "new")]) });
    await refresh;

    expect(store.isRefreshing).toBe(false);
    expect(store.items.map(({ id }) => id)).toEqual(["new"]);
  });

  it("keeps loaded entries when loading an older page fails", async () => {
    const store = new ActivitiesStore(rootStore, {});
    store.hydrate(result([entry("audit", "a1")], { total: 50 }));
    getActivitiesAction.mockResolvedValue({ ok: false, error: {} });

    await store.loadOlder();

    expect(store.items.map(({ id }) => id)).toEqual(["a1"]);
    expect(store.olderPageError).toBe(true);
    expect(store.hasMore).toBe(true);
  });

  it("retries the same older page after a transient failure", async () => {
    const store = new ActivitiesStore(rootStore, {});
    store.hydrate(result([entry("audit", "a1")], { total: 50 }));
    getActivitiesAction.mockResolvedValueOnce({ ok: false, error: {} }).mockResolvedValueOnce({
      ok: true,
      data: result([entry("message", "m1")], { total: 50 }),
    });

    await store.loadOlder();
    await store.loadOlder();

    expect(getActivitiesAction).toHaveBeenCalledTimes(2);
    expect(store.items.map(({ id }) => id)).toEqual(["a1", "m1"]);
    expect(store.olderPageError).toBe(false);
  });

  it("keeps the active personalization while loading older pages", async () => {
    const store = new ActivitiesStore(rootStore, {
      defaultP13nId: "entity-timeline",
    });
    store.hydrate(result([entry("audit", "a1")], { total: 50 }));
    getActivitiesAction.mockResolvedValue({
      ok: true,
      data: result([], { total: 50 }),
    });

    await store.loadOlder();

    expect(getActivitiesAction).toHaveBeenCalledWith(
      expect.objectContaining({
        p13nId: "entity-timeline",
        pagination: { page: 2, pageSize: 25 },
      }),
    );
  });

  it("ends obsolete page loading as soon as a replacement refresh starts", async () => {
    const store = new ActivitiesStore(rootStore, {});
    store.hydrate(result([entry("audit", "old")], { total: 50 }));
    const pending: Array<(value: unknown) => void> = [];
    getActivitiesAction.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));

    const older = store.loadOlder();
    expect(store.loading).toBe(true);

    const replacement = store.applyFilters([
      {
        field: FilterFieldKey.timelineKind,
        operator: FilterOperatorKey.in,
        value: ["message"],
      },
    ]);
    expect(store.loading).toBe(false);

    pending[1]?.({ ok: true, data: result([entry("message", "new")]) });
    await replacement;
    expect(store.items.map(({ id }) => id)).toEqual(["new"]);

    pending[0]?.({ ok: true, data: result([entry("audit", "older")]) });
    await older;
    expect(store.items.map(({ id }) => id)).toEqual(["new"]);
    expect(store.loading).toBe(false);
  });

  it("does not let an older request overwrite newer filters", async () => {
    const store = new ActivitiesStore(rootStore, {});
    const pending: Array<(value: unknown) => void> = [];
    getActivitiesAction.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));

    const first = store.applyFilters([
      {
        field: FilterFieldKey.timelineKind,
        operator: FilterOperatorKey.in,
        value: ["audit"],
      },
    ]);
    const second = store.applyFilters([
      {
        field: FilterFieldKey.timelineKind,
        operator: FilterOperatorKey.in,
        value: ["message"],
      },
    ]);
    pending[1]?.({ ok: true, data: result([entry("message", "new")]) });
    await second;
    pending[0]?.({ ok: true, data: result([entry("audit", "old")]) });
    await first;

    expect(store.items.map(({ id }) => id)).toEqual(["new"]);
  });
});

describe("ActivitiesStore refresh ownership", () => {
  beforeEach(() => vi.clearAllMocks());

  it("consumes and notifies a matching fire-and-forget refresh failure", async () => {
    const failure = new Error("offline");
    const store = new ActivitiesStore(toastingRootStore, { scope: contactScope("contact-1") });
    store.hydrate(result([]));
    getActivitiesAction.mockRejectedValue(failure);

    store.refreshFor(EntityType.contact, "contact-1");

    await vi.waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError).toHaveBeenCalledWith("Common.notifications.unexpectedError", expect.anything());
  });

  it("does not refresh for a record outside the scope", async () => {
    const store = new ActivitiesStore(toastingRootStore, { scope: contactScope("contact-1") });

    store.refreshFor(EntityType.contact, "contact-2");

    await Promise.resolve();
    expect(getActivitiesAction).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();
  });
});
