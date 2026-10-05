import { beforeEach, describe, expect, it, vi } from "vitest";

import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { dateGroupables } from "@/core/base/grouping/groupable-field";
import { QueryParamsPrecheckInteractor } from "@/core/base/query-params-precheck.interactor";
import { ALL_VIEW_KEY, DATA_VIEW_SURFACE_KEYS, SURFACE } from "@/core/data-view/data-view-keys";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { interactorFailureKind } from "@/core/validation/validation.utils";
import { Action, Resource } from "@/generated/prisma";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";
import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { ManageDataViewsInteractor } from "../manage-data-views.interactor";
import {
  ManageDataViewsResultSchema,
  type AgentDataViewState,
  type ManageDataViewsData,
} from "../manage-data-views.schema";

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
    getGroupableFields: vi.fn().mockResolvedValue(dateGroupables("user", { createdAt: true, updatedAt: false })),
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
    invoke: vi.fn((input) =>
      Promise.resolve({
        ok: true,
        data: { viewKey: ALL_VIEW_KEY, state: { ...surfaceState.allState, ...input.state } },
      }),
    ),
  };
  const select = {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: { activeViewKey: VIEW_ID } }),
  };
  const remove = {
    invoke: vi.fn().mockResolvedValue({ ok: true, data: { id: VIEW_ID } }),
  };
  const validator = { invoke: vi.fn().mockResolvedValue(undefined) };
  const queryPrecheck = new QueryParamsPrecheckInteractor(validator as never, validator as never, validator as never);
  const entitlements = { require: vi.fn().mockResolvedValue(null) };
  const interactor = new ManageDataViewsInteractor(
    sources,
    views,
    upsert as never,
    save as never,
    select as never,
    remove as never,
    queryPrecheck,
    entitlements as never,
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
    interactor,
    run: (input: ManageDataViewsData) => runWithTenant(mockUser, () => interactor.invoke(input)),
  };
}

describe("agent saved-view management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    MOCK_ZOD_MODULE.getZodParseContext.mockResolvedValue(undefined);
  });

  it("discovers only surfaces that the caller may read without loading any records or views", async () => {
    const subject = setup();
    const user = createMockUserWithPermissions([{ resource: Resource.users, action: Action.readOwn }]);
    const result = await runWithTenant(user, () => subject.interactor.invoke({ action: "surfaces" }));
    expect(result.ok && result.data).toEqual({
      action: "surfaces",
      total: 3,
      items: [
        { surfaceKey: SURFACE.users, label: "Members", path: "/company/members" },
        { surfaceKey: SURFACE.roles, label: "Roles", path: "/company/roles" },
        { surfaceKey: SURFACE.entityTimeline, label: "Record activity timeline", path: null },
      ],
    });
    expect(subject.views.loadSurfaceState).not.toHaveBeenCalled();
  });

  it("denies an inaccessible page before reading configuration or existing views", async () => {
    const subject = setup();
    const user = createMockUserWithPermissions([]);
    const result = await runWithTenant(user, () =>
      subject.interactor.invoke({
        action: "config",
        surfaceKey: SURFACE.users,
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(interactorFailureKind(result.error)).toBe("authorization");
    expect(subject.sources[SURFACE.users].getFilterableFields).not.toHaveBeenCalled();
    expect(subject.sources[SURFACE.users].getGroupableFields).not.toHaveBeenCalled();
    expect(subject.views.loadSurfaceState).not.toHaveBeenCalled();
  });

  it.each([SURFACE.operatorUsers, SURFACE.operatorWorkspaces, SURFACE.operatorAudit])(
    "rejects operator surface %s before hosted or MCP execution",
    async (surfaceKey) => {
      const subject = setup();
      const result = await subject.run({ action: "config", surfaceKey } as never);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(interactorFailureKind(result.error)).toBe("validation");
      expect(subject.sources[surfaceKey].getFilterableFields).not.toHaveBeenCalled();
    },
  );

  it("returns actual capabilities, including canonical field ids and date grouping buckets", async () => {
    const subject = setup();
    const overview = await subject.run({
      action: "config",
      surfaceKey: SURFACE.users,
    });
    expect(overview.ok && overview.data).toMatchObject({
      action: "config",
      surfaceKey: SURFACE.users,
      section: "overview",
      supportsSearch: true,
      viewModes: ["table", "card"],
      totals: { filters: 1, sorting: 1, grouping: 3 },
      writableStateFields: [
        "filters",
        "searchTerm",
        "sortDescriptor",
        "pageSize",
        "viewMode",
        "grouping",
        "columnOrder",
        "columnWidths",
        "hiddenColumns",
      ],
    });
    const filters = await subject.run({ action: "config", surfaceKey: SURFACE.users, section: "filters" });
    expect(filters.ok && filters.data).toMatchObject({
      action: "config",
      section: "filters",
      total: 1,
      page: 1,
      pageSize: 10,
      totalPages: 1,
      items: [{ field: "name", operators: ["contains"] }],
    });
    const sorting = await subject.run({ action: "config", surfaceKey: SURFACE.users, section: "sorting" });
    expect(sorting.ok && sorting.data.items).toEqual([{ field: "createdAt" }]);
    const grouping = await subject.run({ action: "config", surfaceKey: SURFACE.users, section: "grouping" });
    expect(grouping.ok && grouping.data.items).toHaveLength(3);
  });

  it("tells an agent which inbox date field means the last actual message", async () => {
    const subject = setup();
    const dates = [FilterOperatorKey.inLastDays, FilterOperatorKey.notInLastDays];
    subject.sources[SURFACE.messagingThreads].getFilterableFields.mockResolvedValue([
      { field: "lastMessageSentAt", operators: dates },
      { field: "lastMessageAt", operators: dates },
    ] as never);

    const discovery = await subject.run({ action: "config", surfaceKey: SURFACE.messagingThreads, section: "filters" });

    const items = (discovery.ok ? discovery.data.items : []) as Array<{ field: string; description?: string }>;
    expect(items.find((item) => item.field === "lastMessageSentAt")?.description).toMatch(/ignores drafts/);
    expect(items.find((item) => item.field === "lastMessageAt")?.description).toMatch(/including saved drafts/);
  });

  it("discovers scoped inbox choices and preserves folder references when saving a personal view", async () => {
    const subject = setup();
    const folder = JSON.stringify(["00000000-0000-4000-8000-000000000001", "inbox"]);
    const options = [
      {
        value: folder,
        label: "Inbox",
        groupLabel: "Shared mailbox",
        provider: "mail",
      },
    ];
    subject.sources[SURFACE.messagingThreads].getFilterableFields.mockResolvedValue([
      {
        field: "emailFolder",
        operators: [FilterOperatorKey.in, FilterOperatorKey.notIn],
        options,
      },
    ] as never);
    const discovery = await subject.run({
      action: "config",
      surfaceKey: SURFACE.messagingThreads,
      section: "filters",
    });
    expect(discovery.ok && discovery.data.items).toEqual([
      {
        field: "emailFolder",
        operators: ["in", "notIn"],
        options,
        values: [folder],
        description: expect.stringContaining("account-qualified"),
      },
    ]);
    const filters = [
      {
        field: "emailFolder",
        operator: FilterOperatorKey.notIn as const,
        value: [folder],
      },
    ];
    const result = await subject.run({
      action: "update",
      surfaceKey: SURFACE.messagingThreads,
      viewKey: VIEW_ID,
      state: { filters },
    });
    expect(result.ok).toBe(true);
    expect(subject.upsert.invoke).toHaveBeenCalledWith(
      expect.objectContaining({ state: expect.objectContaining({ filters }) }),
    );
    const rejected = await subject.run({
      action: "update",
      surfaceKey: SURFACE.messagingThreads,
      viewKey: VIEW_ID,
      state: {
        filters: [{ ...filters[0], value: [JSON.stringify([MISSING_ID, "inbox"])] }],
      },
    });
    expect(rejected.ok).toBe(false);
    expect(subject.upsert.invoke).toHaveBeenCalledOnce();
  });

  it("pages summary discovery, narrows only documented keys, and always returns an exact view's fresh state", async () => {
    const subject = setup();
    const views = Array.from({ length: 12 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
      name: index === 7 ? "Renewals" : `View ${index + 1}`,
      position: index,
      state: { searchTerm: `internal-${index + 1}` },
    }));
    subject.views.loadSurfaceState.mockResolvedValue({
      views,
      allState: {},
      activeViewKey: views[7].id,
    });

    const secondPage = await subject.run({
      action: "list",
      surfaceKey: SURFACE.users,
      page: 2,
      pageSize: 5,
    });
    expect(secondPage.ok && secondPage.data).toMatchObject({
      total: 12,
      page: 2,
      pageSize: 5,
      totalPages: 3,
    });
    expect(secondPage.ok && secondPage.data.items).toHaveLength(5);
    if (secondPage.ok) for (const item of secondPage.data.items ?? []) expect(item).not.toHaveProperty("state");

    const exactPageSize = await subject.run({
      action: "list",
      surfaceKey: SURFACE.users,
      pageSize: 6,
    } as never);
    expect(exactPageSize.ok && exactPageSize.data).toMatchObject({ pageSize: 6, totalPages: 2 });
    expect(exactPageSize.ok && exactPageSize.data.items).toHaveLength(6);

    const lastPage = await subject.run({
      action: "list",
      surfaceKey: SURFACE.users,
      page: 2,
      pageSize: 7,
    } as never);
    expect(lastPage.ok && lastPage.data).toMatchObject({ page: 2, pageSize: 7, totalPages: 2 });
    expect(lastPage.ok && lastPage.data.items).toHaveLength(5);

    const narrowed = await subject.run({
      action: "list",
      surfaceKey: SURFACE.users,
      query: "renew",
    });
    expect(narrowed.ok && narrowed.data).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ name: "Renewals" })],
    });
    const hiddenState = await subject.run({
      action: "list",
      surfaceKey: SURFACE.users,
      query: "internal-8",
    });
    expect(hiddenState.ok && hiddenState.data).toMatchObject({ total: 0, items: [] });

    const exact = await subject.run({
      action: "list",
      surfaceKey: SURFACE.users,
      viewKey: views[7].id,
      page: 99,
      pageSize: 25,
      query: "does-not-match",
    });
    expect(exact.ok && exact.data).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 1,
      totalPages: 1,
      items: [{ id: views[7].id, name: "Renewals", state: { searchTerm: "internal-8" } }],
    });
  });

  it.each([
    { action: "list", surfaceKey: SURFACE.users, page: 0 },
    { action: "list", surfaceKey: SURFACE.users, pageSize: 0 },
    { action: "config", surfaceKey: SURFACE.users, pageSize: 26 },
  ])("rejects invalid paging before reading configuration or views: %j", async (input) => {
    const subject = setup();
    const result = await subject.run(input as never);
    expect(result.ok).toBe(false);
    expect(subject.views.loadSurfaceState).not.toHaveBeenCalled();
    expect(subject.sources[SURFACE.users].getFilterableFields).not.toHaveBeenCalled();
    expect(subject.sources[SURFACE.users].getGroupableFields).not.toHaveBeenCalled();
  });

  it("narrows configuration by field and label without matching operator metadata", async () => {
    const subject = setup();
    const operatorOnly = await subject.run({
      action: "config",
      surfaceKey: SURFACE.users,
      section: "filters",
      query: "contains",
    });
    expect(operatorOnly.ok && operatorOnly.data).toMatchObject({ total: 0, items: [] });

    const grouped = await subject.run({
      action: "config",
      surfaceKey: SURFACE.users,
      section: "grouping",
      query: "createdAt",
    });
    expect(grouped.ok && grouped.data).toMatchObject({ total: 3 });
    expect(grouped.ok && grouped.data.items).toHaveLength(3);
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
      surfaceKey: SURFACE.users,
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

  it("rejects hidden ownership fields, unsupported columns and per-action stray fields on the wire", async () => {
    const subject = setup();
    for (const input of [
      {
        action: "create",
        surfaceKey: SURFACE.users,
        name: "Hidden",
        state: {},
        userId: VIEW_ID,
      },
      {
        action: "create",
        surfaceKey: SURFACE.users,
        name: "Columns",
        state: { hiddenColumns: ["invented"] },
      },
      {
        action: "select",
        surfaceKey: SURFACE.users,
        viewKey: VIEW_ID,
        name: "Ignored",
      },
    ])
      expect((await subject.run(input as never)).ok).toBe(false);
    expect(subject.upsert.invoke).not.toHaveBeenCalled();
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
      surfaceKey: SURFACE.users,
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
      surfaceKey: SURFACE.users,
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
      link: `/company/members?view=${VIEW_ID}`,
    });
  });

  it("accepts the full listed state echoed back and applies only the keys that changed", async () => {
    const subject = setup();
    subject.surfaceState.views[0].state = {
      ...subject.surfaceState.views[0].state,
      columnOrder: ["name", "createdAt"],
      hiddenColumns: ["updatedAt"],
    } as never;
    const listed = await subject.run({ action: "list", surfaceKey: SURFACE.users, viewKey: VIEW_ID });
    const item = (listed.ok && listed.data.items?.[0]) as { name: string; state: Record<string, unknown> };
    expect(item.state).toMatchObject({ columnOrder: ["name", "createdAt"], hiddenColumns: ["updatedAt"] });

    const result = await subject.run({
      action: "update",
      surfaceKey: SURFACE.users,
      viewKey: VIEW_ID,
      name: item.name,
      state: { ...item.state, searchTerm: "new", viewMode: ViewMode.card } as AgentDataViewState,
    });

    expect(result.ok).toBe(true);
    expect(subject.upsert.invoke).toHaveBeenCalledWith({
      id: VIEW_ID,
      surfaceKey: SURFACE.users,
      state: { searchTerm: "new", viewMode: ViewMode.card },
    });
  });

  it("treats an unchanged echo of the listed state as a no-op without writing or reading configuration", async () => {
    const subject = setup();
    subject.sources[SURFACE.users].getFilterableFields.mockRejectedValue(new Error("configuration unavailable"));
    subject.sources[SURFACE.users].getGroupableFields.mockRejectedValue(new Error("configuration unavailable"));
    const [view] = subject.surfaceState.views;

    const named = await subject.run({
      action: "update",
      surfaceKey: SURFACE.users,
      viewKey: VIEW_ID,
      name: view.name,
      state: view.state as AgentDataViewState,
    });
    expect(named.ok && named.data).toMatchObject({
      action: "update",
      viewKey: VIEW_ID,
      name: view.name,
      state: view.state,
      link: `/company/members?view=${VIEW_ID}`,
    });

    const all = await subject.run({
      action: "update",
      surfaceKey: SURFACE.users,
      viewKey: ALL_VIEW_KEY,
      state: { pageSize: 25 },
    });
    expect(all.ok && all.data).toMatchObject({ viewKey: ALL_VIEW_KEY, state: { pageSize: 25 } });
    expect(subject.upsert.invoke).not.toHaveBeenCalled();
    expect(subject.save.invoke).not.toHaveBeenCalled();
    expect(subject.sources[SURFACE.users].getFilterableFields).not.toHaveBeenCalled();
    expect(subject.sources[SURFACE.users].getGroupableFields).not.toHaveBeenCalled();
  });

  it("applies a changed column layout through the same changed-keys patch", async () => {
    const subject = setup();
    const result = await subject.run({
      action: "update",
      surfaceKey: SURFACE.users,
      viewKey: VIEW_ID,
      state: { ...subject.surfaceState.views[0].state, hiddenColumns: ["createdAt"] } as AgentDataViewState,
    });
    expect(result.ok).toBe(true);
    expect(subject.upsert.invoke).toHaveBeenCalledWith({
      id: VIEW_ID,
      surfaceKey: SURFACE.users,
      state: { hiddenColumns: ["createdAt"] },
    });
  });

  it("renames without loading or validating unrelated view configuration", async () => {
    const subject = setup();
    subject.sources[SURFACE.users].getFilterableFields.mockRejectedValue(new Error("configuration unavailable"));
    subject.sources[SURFACE.users].getGroupableFields.mockRejectedValue(new Error("configuration unavailable"));

    const result = await subject.run({
      action: "update",
      surfaceKey: SURFACE.users,
      viewKey: VIEW_ID,
      name: "Renamed only",
    });

    expect(result.ok).toBe(true);
    expect(subject.upsert.invoke).toHaveBeenCalledWith({
      id: VIEW_ID,
      surfaceKey: SURFACE.users,
      name: "Renamed only",
    });
    expect(subject.sources[SURFACE.users].getFilterableFields).not.toHaveBeenCalled();
    expect(subject.sources[SURFACE.users].getGroupableFields).not.toHaveBeenCalled();
  });

  it("rejects a malformed child result through the declared output contract", async () => {
    const subject = setup();
    subject.upsert.invoke.mockResolvedValueOnce({
      ok: true,
      data: {
        ...subject.surfaceState.views[0],
        surfaceKey: SURFACE.users,
        name: 42,
      },
    } as never);

    await expect(
      subject.run({
        action: "create",
        surfaceKey: SURFACE.users,
        name: "Valid request",
        state: {},
      }),
    ).rejects.toThrow("expected string");
  });

  it("requires the navigation fields promised by every successful mutation result", () => {
    for (const action of ["create", "update", "select"] as const) {
      expect(ManageDataViewsResultSchema.safeParse({ action }).success, action).toBe(false);
      expect(
        ManageDataViewsResultSchema.safeParse({
          action,
          surfaceKey: SURFACE.users,
          viewKey: VIEW_ID,
          link: `/company/members?view=${VIEW_ID}`,
          ...(action === "create" || action === "select" ? { selected: true } : {}),
        }).success,
        action,
      ).toBe(true);
    }
    expect(ManageDataViewsResultSchema.safeParse({ action: "delete" }).success).toBe(false);
    expect(
      ManageDataViewsResultSchema.safeParse({
        action: "delete",
        surfaceKey: SURFACE.users,
        viewKey: VIEW_ID,
        deleted: true,
      }).success,
    ).toBe(true);
  });

  it.each([
    {
      action: "update",
      surfaceKey: SURFACE.users,
      viewKey: ALL_VIEW_KEY,
      link: null,
    },
    {
      action: "update",
      surfaceKey: SURFACE.users,
      viewKey: ALL_VIEW_KEY,
      link: "/deals?view=__all__",
    },
    {
      action: "update",
      surfaceKey: SURFACE.users,
      viewKey: ALL_VIEW_KEY,
      link: `/company/members?view=${VIEW_ID}`,
    },
    {
      action: "create",
      surfaceKey: SURFACE.entityTimeline,
      viewKey: VIEW_ID,
      link: `/company/members?view=${VIEW_ID}`,
      selected: true,
    },
  ])("rejects an incoherent mutation destination: %j", (result) => {
    expect(ManageDataViewsResultSchema.safeParse(result).success).toBe(false);
  });

  it.each([
    { action: "update", surfaceKey: SURFACE.users, viewKey: VIEW_ID },
    { action: "update", surfaceKey: SURFACE.users, viewKey: VIEW_ID, state: {} },
  ])("rejects an empty update before any read or write: %j", async (input) => {
    const subject = setup();
    const result = await subject.run(input as never);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(interactorFailureKind(result.error)).toBe("validation");
      expect(result.error.issues).toEqual([
        expect.objectContaining({ params: { error: CustomErrorCode.dataViewUpdateEmpty } }),
      ]);
    }
    expect(subject.views.loadSurfaceState).not.toHaveBeenCalled();
    expect(subject.upsert.invoke).not.toHaveBeenCalled();
    expect(subject.save.invoke).not.toHaveBeenCalled();
  });

  it.each(["list", "update", "select", "delete"] as const)(
    "treats missing, other-user and wrong-surface ids as not found for %s",
    async (action) => {
      const subject = setup();
      const result = await subject.run({
        action,
        surfaceKey: SURFACE.users,
        viewKey: MISSING_ID,
        ...(action === "update" ? { name: "Missing" } : {}),
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
      surfaceKey: SURFACE.users,
      viewKey: ALL_VIEW_KEY,
      state: { searchTerm: "" },
    });
    expect(result.ok && result.data.state).toEqual({
      pageSize: 25,
      searchTerm: "",
    });
    expect(subject.save.invoke).toHaveBeenCalledWith({
      surfaceKey: SURFACE.users,
      viewKey: ALL_VIEW_KEY,
      state: { searchTerm: "" },
    });
    const renamed = await subject.run({
      action: "update",
      surfaceKey: SURFACE.users,
      viewKey: ALL_VIEW_KEY,
      name: "Renamed",
    });
    expect(renamed.ok).toBe(false);
    if (!renamed.ok) {
      expect(renamed.error.issues).toEqual([
        expect.objectContaining({ path: ["name"], params: { error: CustomErrorCode.dataViewAllNameImmutable } }),
      ]);
    }
    expect(subject.save.invoke).toHaveBeenCalledTimes(1);
  });

  it("returns the post-transaction All state instead of rebuilding it from the earlier surface read", async () => {
    const subject = setup();
    subject.save.invoke.mockResolvedValueOnce({
      ok: true,
      data: {
        viewKey: ALL_VIEW_KEY,
        state: { pageSize: 25, viewMode: ViewMode.card, searchTerm: "concurrent" },
      },
    });

    const result = await subject.run({
      action: "update",
      surfaceKey: SURFACE.users,
      viewKey: ALL_VIEW_KEY,
      state: { viewMode: ViewMode.card },
    });

    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        action: "update",
        viewKey: ALL_VIEW_KEY,
        state: { pageSize: 25, viewMode: ViewMode.card, searchTerm: "concurrent" },
      }),
    });
  });

  it("rejects a named-view child result while saving the All view", async () => {
    const subject = setup();
    subject.save.invoke.mockResolvedValueOnce({
      ok: true,
      data: { viewKey: VIEW_ID },
    } as never);

    await expect(
      subject.run({
        action: "update",
        surfaceKey: SURFACE.users,
        viewKey: ALL_VIEW_KEY,
        state: { viewMode: ViewMode.card },
      }),
    ).rejects.toThrow("returned a named-view result while saving the All view");
  });

  it("delegates deletion without resetting a newer selection from stale surface state", async () => {
    const subject = setup();
    const result = await subject.run({
      action: "delete",
      surfaceKey: SURFACE.users,
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
