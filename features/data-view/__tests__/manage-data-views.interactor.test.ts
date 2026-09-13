import { beforeEach, describe, expect, it, vi } from "vitest";

import { Action, Resource } from "@/generated/prisma";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { ALL_VIEW_KEY, DATA_VIEW_SURFACE_KEYS, SURFACE } from "@/core/data-view/data-view-keys";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import { dateGroupables } from "@/core/base/grouping/groupable-field";
import { interactorFailureKind } from "@/core/validation/validation.utils";
import { ManageDataViewsInteractor } from "../manage-data-views.interactor";
import type { AgentDataViewState, ManageDataViewsData } from "../manage-data-views.schema";

const mockUser = createMockUser();
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));

const VIEW_ID = "b982b3d9-4a74-4410-b54e-958743a580ff";
const MISSING_ID = "40000000-0000-4000-8000-000000000001";

function setup() {
  const source = () => ({
    getSearchableFields: vi.fn(() => [{ field: "name" }]),
    getSortableFields: vi.fn(() => [{ field: "createdAt", resolvedFields: ["createdAt"] }]),
    getFilterableFields: vi.fn().mockResolvedValue([{ field: "name", operators: [FilterOperatorKey.contains] }]),
    getCustomColumns: vi.fn().mockResolvedValue([]),
    getGroupableFields: vi.fn().mockResolvedValue(dateGroupables("contact", { createdAt: true, updatedAt: false })),
    setMessagingSourcesEnabled: vi.fn(),
  });
  const sources = Object.fromEntries(DATA_VIEW_SURFACE_KEYS.map((key) => [key, source()])) as Record<
    (typeof DATA_VIEW_SURFACE_KEYS)[number],
    ReturnType<typeof source>
  >;
  const view = {
    id: VIEW_ID,
    name: "Existing",
    position: 0,
    state: { searchTerm: "old", columnWidths: { name: 210 } },
  };
  const surfaceState = {
    views: [view],
    allState: { pageSize: 25 as const },
    activeViewKey: VIEW_ID,
  };
  const views = { loadSurfaceState: vi.fn().mockResolvedValue(surfaceState) };
  const upsert = {
    invoke: vi.fn((input) =>
      Promise.resolve({
        ok: true,
        data: {
          ...view,
          id: input.id ?? VIEW_ID,
          surfaceKey: input.surfaceKey,
          ...(input.name === undefined ? {} : { name: input.name }),
          state: { ...view.state, ...input.state },
        },
      }),
    ),
  };
  const save = {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: { viewKey: ALL_VIEW_KEY } }),
  };
  const select = {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: { activeViewKey: VIEW_ID } }),
  };
  const remove = {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: { id: VIEW_ID } }),
  };
  const validator = { invoke: vi.fn().mockResolvedValue(undefined) };
  const queryPrecheck = new QueryParamsPrecheckInteractor(
    validator as never,
    validator as never,
    validator as never,
    validator as never,
    validator as never,
    validator as never,
    validator as never,
    validator as never,
    { findByEntityType: vi.fn().mockResolvedValue([]) } as never,
  );
  const entitlements = { require: vi.fn().mockResolvedValue(null) };
  const operator = { isEligible: vi.fn().mockResolvedValue(false) };
  const interactor = new ManageDataViewsInteractor(
    sources,
    views,
    upsert as never,
    save as never,
    select as never,
    remove as never,
    queryPrecheck,
    entitlements as never,
    operator as never,
  );
  return {
    sources,
    surfaceState,
    views,
    upsert,
    save,
    select,
    remove,
    entitlements,
    operator,
    interactor,
    run: (input: ManageDataViewsData) => runWithTenant(mockUser, () => interactor.invoke(input)),
  };
}

describe("agent saved-view management", () => {
  beforeEach(() => vi.clearAllMocks());

  it("discovers only surfaces that the caller may read without loading any records or views", async () => {
    const subject = setup();
    const user = createMockUserWithPermissions([{ resource: Resource.contacts, action: Action.readOwn }]);
    const result = await runWithTenant(user, () => subject.interactor.invoke({ action: "surfaces" }));
    expect(result.ok && result.data.surfaces).toEqual([
      {
        surfaceKey: SURFACE.contacts,
        label: "Contacts",
        path: "/contacts",
        entityType: "contact",
      },
    ]);
    expect(subject.views.loadSurfaceState).not.toHaveBeenCalled();
  });

  it("denies an inaccessible page before reading configuration or existing views", async () => {
    const subject = setup();
    const user = createMockUserWithPermissions([]);
    const result = await runWithTenant(user, () =>
      subject.interactor.invoke({
        action: "config",
        surfaceKey: SURFACE.contacts,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureKind(result.error)).toBe("authorization");
    expect(subject.sources[SURFACE.contacts].getCustomColumns).not.toHaveBeenCalled();
    expect(subject.views.loadSurfaceState).not.toHaveBeenCalled();
  });

  it("uses fresh operator access even for a tenant administrator", async () => {
    const subject = setup();
    const result = await subject.run({
      action: "config",
      surfaceKey: SURFACE.operatorUsers,
    });
    expect(result.ok).toBe(false);
    expect(subject.operator.isEligible).toHaveBeenCalledOnce();
    expect(subject.sources[SURFACE.operatorUsers].getFilterableFields).not.toHaveBeenCalled();
  });

  it("returns actual capabilities, including canonical field ids and date grouping buckets", async () => {
    const subject = setup();
    const result = await subject.run({
      action: "config",
      surfaceKey: SURFACE.contacts,
    });
    expect(result.ok && result.data).toMatchObject({
      surfaceKey: SURFACE.contacts,
      supportsSearch: true,
      viewModes: ["table", "card"],
      filterableFields: [{ field: "name", operators: ["contains"] }],
      sortableFields: [{ field: "createdAt" }],
      writableStateFields: ["filters", "searchTerm", "sortDescriptor", "pageSize", "viewMode", "grouping"],
    });
    expect(result.ok && (result.data.groupableFields as unknown[]).length).toBe(3);
  });

  it("configures activity metadata using the same messaging source entitlement as activity reads", async () => {
    const subject = setup();
    await subject.run({ action: "config", surfaceKey: SURFACE.entityTimeline });
    expect(subject.sources[SURFACE.entityTimeline].setMessagingSourcesEnabled).toHaveBeenCalledWith(true);
    const user = createMockUserWithPermissions([{ resource: Resource.auditLog, action: Action.readAll }]);
    await runWithTenant(user, () =>
      subject.interactor.invoke({
        action: "config",
        surfaceKey: SURFACE.entityTimeline,
      }),
    );
    expect(subject.sources[SURFACE.entityTimeline].setMessagingSourcesEnabled).toHaveBeenLastCalledWith(false);
  });

  it.each([
    {
      filters: [{ field: "invented", operator: FilterOperatorKey.contains, value: "x" }],
    },
    {
      filters: [{ field: "name", operator: FilterOperatorKey.equals, value: "x" }],
    },
    { sortDescriptor: { field: "invented", direction: "asc" as const } },
    { grouping: { field: "invented" } },
  ] satisfies AgentDataViewState[])("rejects invalid discovered configuration before any write: %j", async (state) => {
    const subject = setup();
    const result = await subject.run({
      action: "create",
      surfaceKey: SURFACE.contacts,
      name: "Invalid",
      state,
    });
    expect(result.ok).toBe(false);
    expect(subject.upsert.invoke).not.toHaveBeenCalled();
  });

  it("rejects search and card layout when the surface cannot display them", async () => {
    const subject = setup();
    vi.mocked(subject.sources[SURFACE.roles].getSearchableFields).mockReturnValue([]);
    vi.mocked(subject.sources[SURFACE.roles].getGroupableFields).mockResolvedValue([]);
    for (const state of [{ searchTerm: "ignored" }, { viewMode: ViewMode.card }]) {
      const result = await subject.run({
        action: "create",
        surfaceKey: SURFACE.roles,
        name: "Invalid",
        state,
      });
      expect(result.ok).toBe(false);
    }
    expect(subject.upsert.invoke).not.toHaveBeenCalled();
  });

  it("rejects duplicate timeline filters and fixed timeline presentation fields before saving", async () => {
    const subject = setup();
    for (const state of [
      {
        filters: [
          { field: "timelineKind", operator: FilterOperatorKey.in, value: ["audit"] },
          { field: "timelineKind", operator: FilterOperatorKey.in, value: ["message"] },
        ],
      },
      { pageSize: 10 as const },
    ] satisfies AgentDataViewState[]) {
      expect(
        (await subject.run({ action: "create", surfaceKey: SURFACE.entityTimeline, name: "Activity", state })).ok,
      ).toBe(false);
    }
    expect(subject.upsert.invoke).not.toHaveBeenCalled();
  });

  it("only advertises and accepts the timeline's implemented sort fields", async () => {
    const subject = setup();
    subject.sources[SURFACE.entityTimeline].getSortableFields.mockReturnValue([
      { field: "at", resolvedFields: ["at"] },
    ]);
    subject.sources[SURFACE.entityTimeline].getCustomColumns.mockResolvedValue([
      { id: VIEW_ID, label: "Stage", type: "singleSelect" },
    ]);
    const config = await subject.run({ action: "config", surfaceKey: SURFACE.entityTimeline });
    expect(config.ok && config.data.sortableFields).toEqual([{ field: "at" }]);
    const result = await subject.run({
      action: "create",
      surfaceKey: SURFACE.entityTimeline,
      name: "Activity",
      state: { sortDescriptor: { field: VIEW_ID, direction: "asc" } },
    });
    expect(result.ok).toBe(false);
    expect(subject.upsert.invoke).not.toHaveBeenCalled();
  });

  it("rejects hidden ownership fields, unsupported columns and per-action stray fields on the wire", async () => {
    const subject = setup();
    for (const input of [
      {
        action: "create",
        surfaceKey: SURFACE.contacts,
        name: "Hidden",
        state: {},
        userId: VIEW_ID,
      },
      {
        action: "create",
        surfaceKey: SURFACE.contacts,
        name: "Columns",
        state: { hiddenColumns: ["invented"] },
      },
      {
        action: "select",
        surfaceKey: SURFACE.contacts,
        viewKey: VIEW_ID,
        name: "Ignored",
      },
    ])
      expect((await subject.run(input as never)).ok).toBe(false);
    expect(subject.views.loadSurfaceState).not.toHaveBeenCalled();
  });

  it("patches only supplied fields without sending a stale view name", async () => {
    const subject = setup();
    subject.upsert.invoke.mockImplementationOnce((input) =>
      Promise.resolve({
        ok: true,
        data: {
          ...subject.surfaceState.views[0],
          name: "Renamed concurrently",
          surfaceKey: input.surfaceKey,
          state: { ...subject.surfaceState.views[0].state, ...input.state },
        },
      }),
    );
    const result = await subject.run({
      action: "update",
      surfaceKey: SURFACE.contacts,
      viewKey: VIEW_ID,
      state: {
        filters: [],
        searchTerm: "",
        grouping: null,
        sortDescriptor: null,
      },
    });
    expect(subject.upsert.invoke).toHaveBeenCalledWith({
      id: VIEW_ID,
      surfaceKey: SURFACE.contacts,
      state: {
        filters: [],
        searchTerm: "",
        grouping: null,
        sortDescriptor: null,
      },
    });
    expect(result.ok && result.data).toMatchObject({
      viewKey: VIEW_ID,
      name: "Renamed concurrently",
      state: {
        columnWidths: { name: 210 },
        searchTerm: "",
        filters: [],
        grouping: null,
        sortDescriptor: null,
      },
      link: `/contacts?view=${VIEW_ID}`,
    });
  });

  it.each(["update", "select", "delete"] as const)(
    "treats missing, other-user and wrong-surface ids as not found for %s",
    async (action) => {
      const subject = setup();
      const result = await subject.run({
        action,
        surfaceKey: SURFACE.contacts,
        viewKey: MISSING_ID,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(interactorFailureKind(result.error)).toBe("not_found");
      expect(subject.upsert.invoke).not.toHaveBeenCalled();
      expect(subject.select.invoke).not.toHaveBeenCalled();
      expect(subject.remove.invoke).not.toHaveBeenCalled();
    },
  );

  it("updates All as a partial personalization patch and never renames it", async () => {
    const subject = setup();
    const result = await subject.run({
      action: "update",
      surfaceKey: SURFACE.contacts,
      viewKey: ALL_VIEW_KEY,
      state: { searchTerm: "" },
    });
    expect(result.ok && result.data.state).toEqual({
      pageSize: 25,
      searchTerm: "",
    });
    expect(subject.save.invoke).toHaveBeenCalledWith({
      surfaceKey: SURFACE.contacts,
      viewKey: ALL_VIEW_KEY,
      state: { searchTerm: "" },
    });
    expect(
      (
        await subject.run({
          action: "update",
          surfaceKey: SURFACE.contacts,
          viewKey: ALL_VIEW_KEY,
          name: "Renamed",
        })
      ).ok,
    ).toBe(false);
  });

  it("delegates deletion without resetting a newer selection from stale surface state", async () => {
    const subject = setup();
    const result = await subject.run({
      action: "delete",
      surfaceKey: SURFACE.contacts,
      viewKey: VIEW_ID,
    });
    expect(result.ok && result.data).toMatchObject({
      deleted: true,
      viewKey: VIEW_ID,
    });
    expect(subject.remove.invoke).toHaveBeenCalledWith({ id: VIEW_ID });
    expect(subject.select.invoke).not.toHaveBeenCalled();
  });
});
