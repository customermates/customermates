import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const {
  dataViewAggregate,
  dataViewCreate,
  dataViewDeleteMany,
  dataViewFindFirst,
  dataViewFindMany,
  dataViewUpdateMany,
  overrideDeleteMany,
  overrideFindMany,
  overrideUpsert,
  p13nFindUnique,
} = vi.hoisted(() => ({
  dataViewAggregate: vi.fn(),
  dataViewCreate: vi.fn(),
  dataViewDeleteMany: vi.fn(),
  dataViewFindFirst: vi.fn(),
  dataViewFindMany: vi.fn(),
  dataViewUpdateMany: vi.fn(),
  overrideDeleteMany: vi.fn(),
  overrideFindMany: vi.fn(),
  overrideUpsert: vi.fn(),
  p13nFindUnique: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => ({
  ...MOCK_PRISMA_DB_MODULE,
  prisma: {
    ...MOCK_PRISMA_DB_MODULE.prisma,
    dataView: {
      aggregate: dataViewAggregate,
      create: dataViewCreate,
      deleteMany: dataViewDeleteMany,
      findFirst: dataViewFindFirst,
      findMany: dataViewFindMany,
      updateMany: dataViewUpdateMany,
    },
    dataViewOverride: {
      deleteMany: overrideDeleteMany,
      findMany: overrideFindMany,
      upsert: overrideUpsert,
    },
    p13n: { findUnique: p13nFindUnique },
  },
}));

import { Prisma } from "@/generated/prisma";

import { PrismaDataViewRepo } from "../prisma-data-view.repository";
import { PrismaDataViewOverrideRepo } from "../prisma-data-view-override.repository";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { runWithTenant } from "@/core/decorators/tenant-context";

const SURFACE = "contacts-card-store";
const A_VIEW_ID = "3a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";
const A_SECOND_VIEW_ID = "3a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f71";
const A_GROUPING_COLUMN = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e";

function storedView(overrides: Record<string, unknown> = {}) {
  return {
    id: A_VIEW_ID,
    userId: mockUser.id,
    surfaceKey: SURFACE,
    name: "Hot leads",
    visibility: "private",
    position: 0,
    filters: null,
    searchTerm: null,
    sortDescriptor: null,
    viewMode: null,
    groupingColumnId: null,
    grouping: null,
    columnOrder: null,
    columnWidths: null,
    hiddenColumns: null,
    pageSize: null,
    user: { firstName: "Test", lastName: "User" },
    ...overrides,
  };
}

function asTenant<T>(fn: () => Promise<T>) {
  return runWithTenant(mockUser, fn);
}

describe("PrismaDataViewRepo scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataViewFindMany.mockResolvedValue([]);
    overrideFindMany.mockResolvedValue([]);
    p13nFindUnique.mockResolvedValue(null);
    dataViewFindFirst.mockResolvedValue(null);
    dataViewAggregate.mockResolvedValue({ _max: { position: null } });
    dataViewUpdateMany.mockResolvedValue({ count: 0 });
    dataViewDeleteMany.mockResolvedValue({ count: 0 });
    overrideDeleteMany.mockResolvedValue({ count: 0 });
    overrideUpsert.mockResolvedValue({});
    dataViewCreate.mockResolvedValue(storedView());
  });

  it("lists the caller's own views and every workspace-visible view of the surface", async () => {
    await asTenant(() => new PrismaDataViewRepo().listDataViews(SURFACE));

    expect(dataViewFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId: mockUser.companyId,
          surfaceKey: SURFACE,
          OR: [{ userId: mockUser.id }, { visibility: "workspace" }],
        },
      }),
    );
  });

  it("resolves a view id with findFirst so an unreadable id returns null rather than leaking existence", async () => {
    const found = await asTenant(() => new PrismaDataViewRepo().findViewById(A_VIEW_ID));

    expect(found).toBeNull();
    expect(dataViewFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: A_VIEW_ID,
          companyId: mockUser.companyId,
          OR: [{ userId: mockUser.id }, { visibility: "workspace" }],
        },
      }),
    );
  });

  it("scopes the owner-only lookup, update and delete by both companyId and userId", async () => {
    await asTenant(() => new PrismaDataViewRepo().findOwnedOrNull(A_VIEW_ID));
    await asTenant(() => new PrismaDataViewRepo().updateOwned({ id: A_VIEW_ID, name: "Renamed" }));
    await asTenant(() => new PrismaDataViewRepo().deleteOwned(A_VIEW_ID));

    const ownedWhere = { id: A_VIEW_ID, companyId: mockUser.companyId, userId: mockUser.id };

    expect(dataViewFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: ownedWhere }));
    expect(dataViewUpdateMany).toHaveBeenCalledWith({ where: ownedWhere, data: { name: "Renamed" } });
    expect(dataViewDeleteMany).toHaveBeenCalledWith({ where: ownedWhere });
  });

  it("returns null from updateOwned when the row is not owned, and never re-reads it", async () => {
    dataViewUpdateMany.mockResolvedValue({ count: 0 });

    const updated = await asTenant(() => new PrismaDataViewRepo().updateOwned({ id: A_VIEW_ID, name: "Renamed" }));

    expect(updated).toBeNull();
    expect(dataViewFindFirst).not.toHaveBeenCalled();
  });

  it("writes only the state columns a partial save declares, so the rest of the view survives", async () => {
    await asTenant(() =>
      new PrismaDataViewRepo().updateOwned({ id: A_VIEW_ID, name: "Hot leads", state: { filters: [] } }),
    );

    expect(dataViewUpdateMany.mock.calls[0][0].data).toEqual({ name: "Hot leads", filters: [] });
  });

  it("writes every state column when the save carries a total state", async () => {
    await asTenant(() =>
      new PrismaDataViewRepo().updateOwned({
        id: A_VIEW_ID,
        state: {
          filters: [],
          searchTerm: "",
          sortDescriptor: null,
          pageSize: 25,
          viewMode: ViewMode.card,
          grouping: null,
          columnOrder: [],
          columnWidths: {},
          hiddenColumns: [],
        },
      }),
    );

    expect(Object.keys(dataViewUpdateMany.mock.calls[0][0].data).sort()).toEqual([
      "columnOrder",
      "columnWidths",
      "filters",
      "grouping",
      "groupingColumnId",
      "hiddenColumns",
      "pageSize",
      "searchTerm",
      "sortDescriptor",
      "viewMode",
    ]);
  });

  it("leaves visibility out of the update when the save carries none", async () => {
    await asTenant(() => new PrismaDataViewRepo().updateOwned({ id: A_VIEW_ID, name: "Hot leads" }));

    expect(dataViewUpdateMany.mock.calls[0][0].data).not.toHaveProperty("visibility");
  });

  it("carries companyId in data on create", async () => {
    await asTenant(() =>
      new PrismaDataViewRepo().createView({
        surfaceKey: SURFACE,
        name: "Hot leads",
        visibility: "private",
        position: 0,
        state: { filters: [] },
      }),
    );

    expect(dataViewCreate.mock.calls[0][0].data).toMatchObject({
      companyId: mockUser.companyId,
      userId: mockUser.id,
      surfaceKey: SURFACE,
      filters: [],
    });
  });

  it("starts positions at zero and continues from the caller's own highest position", async () => {
    expect(await asTenant(() => new PrismaDataViewRepo().nextPosition(SURFACE))).toBe(0);

    dataViewAggregate.mockResolvedValue({ _max: { position: 4 } });
    expect(await asTenant(() => new PrismaDataViewRepo().nextPosition(SURFACE))).toBe(5);

    expect(dataViewAggregate).toHaveBeenCalledWith({
      where: { companyId: mockUser.companyId, userId: mockUser.id, surfaceKey: SURFACE },
      _max: { position: true },
    });
  });
});

describe("PrismaDataViewRepo stored state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overrideFindMany.mockResolvedValue([]);
    p13nFindUnique.mockResolvedValue(null);
  });

  it("normalizes legacy relation filters on a view and on an override alike", async () => {
    const legacy = [{ field: FilterFieldKey.dealIds, operator: FilterOperatorKey.hasNone, value: ["d1"] }];
    dataViewFindMany.mockResolvedValue([storedView({ filters: legacy })]);
    overrideFindMany.mockResolvedValue([{ ...storedView({ filters: legacy }), viewKey: "__all__" }]);

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    const normalized = [{ field: FilterFieldKey.dealIds, operator: FilterOperatorKey.notIn, value: ["d1"] }];
    expect(surface.views[0].state.filters).toEqual(normalized);
    expect(surface.overrides.get("__all__")?.filters).toEqual(normalized);
  });

  it("reads a view holding a malformed stored filter entry without throwing", async () => {
    const malformed = [null, { field: FilterFieldKey.dealIds, operator: FilterOperatorKey.hasSome, value: ["d2"] }];
    dataViewFindMany.mockResolvedValue([storedView({ filters: malformed })]);
    overrideFindMany.mockResolvedValue([{ ...storedView({ filters: malformed }), viewKey: "__all__" }]);

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    const tolerated = [null, { field: FilterFieldKey.dealIds, operator: FilterOperatorKey.in, value: ["d2"] }];
    expect(surface.views[0].state.filters).toEqual(tolerated);
    expect(surface.overrides.get("__all__")?.filters).toEqual(tolerated);
  });

  it("distinguishes an unset column from a cleared value", async () => {
    dataViewFindMany.mockResolvedValue([
      storedView({ filters: [], searchTerm: "", columnOrder: [], columnWidths: {}, hiddenColumns: [] }),
    ]);

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(surface.views[0].state).toEqual({
      filters: [],
      searchTerm: "",
      columnOrder: [],
      columnWidths: {},
      hiddenColumns: [],
    });
  });

  it("reads a cleared sort descriptor and a cleared grouping as present nulls", async () => {
    dataViewFindMany.mockResolvedValue([storedView({ sortDescriptor: {}, grouping: {} })]);

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(surface.views[0].state).toEqual({ sortDescriptor: null, grouping: null });
    expect("sortDescriptor" in surface.views[0].state).toBe(true);
  });

  it("lifts a legacy grouping column into a descriptor only on a stored board", async () => {
    dataViewFindMany.mockResolvedValue([
      storedView({ groupingColumnId: A_GROUPING_COLUMN, viewMode: "card" }),
      { ...storedView({ groupingColumnId: A_GROUPING_COLUMN, viewMode: "table" }), id: A_SECOND_VIEW_ID },
    ]);

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(surface.views[0].state.grouping).toEqual({ field: A_GROUPING_COLUMN });
    expect(surface.views[1].state).not.toHaveProperty("grouping");
  });

  it("drops an override whose view key is neither the All key nor a readable view", async () => {
    dataViewFindMany.mockResolvedValue([storedView()]);
    overrideFindMany.mockResolvedValue([
      { ...storedView(), viewKey: "__all__" },
      { ...storedView(), viewKey: A_VIEW_ID },
      { ...storedView(), viewKey: "22222222-2222-4222-8222-222222222222" },
    ]);

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect([...surface.overrides.keys()].sort()).toEqual([A_VIEW_ID, "__all__"].sort());
  });

  it("marks a colleague's workspace view as not owned and names its owner", async () => {
    dataViewFindMany.mockResolvedValue([
      storedView({ userId: "someone-else", visibility: "workspace", user: { firstName: "Sofia", lastName: "Rossi" } }),
    ]);

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(surface.views[0]).toMatchObject({ isOwner: false, ownerName: "Sofia Rossi" });
  });

  it("reads the remembered chip from the caller's own personalization row", async () => {
    dataViewFindMany.mockResolvedValue([]);
    p13nFindUnique.mockResolvedValue({ activeViewKey: "__all__" });

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(surface.activeViewKey).toBe("__all__");
    expect(p13nFindUnique).toHaveBeenCalledWith({
      where: {
        companyId_userId_p13nId: { companyId: mockUser.companyId, userId: mockUser.id, p13nId: SURFACE },
        companyId: mockUser.companyId,
      },
      select: { activeViewKey: true },
    });
  });
});

describe("PrismaDataViewOverrideRepo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    overrideUpsert.mockResolvedValue({});
    overrideDeleteMany.mockResolvedValue({ count: 1 });
  });

  it("carries companyId in the compound key, as a sibling, in create and in update", async () => {
    await asTenant(() =>
      new PrismaDataViewOverrideRepo().upsertOverride({
        surfaceKey: SURFACE,
        viewKey: "__all__",
        delta: { columnWidths: { name: 200 } },
      }),
    );

    const args = overrideUpsert.mock.calls[0][0];

    expect(args.where.companyId_userId_surfaceKey_viewKey.companyId).toBe(mockUser.companyId);
    expect(args.where.companyId).toBe(mockUser.companyId);
    expect(args.create.companyId).toBe(mockUser.companyId);
    expect(args.update.companyId).toBe(mockUser.companyId);
  });

  it("derives viewId from viewKey server side and never from the caller", async () => {
    const repo = new PrismaDataViewOverrideRepo();

    await asTenant(() => repo.upsertOverride({ surfaceKey: SURFACE, viewKey: "__all__", delta: { pageSize: 25 } }));
    await asTenant(() => repo.upsertOverride({ surfaceKey: SURFACE, viewKey: A_VIEW_ID, delta: { pageSize: 25 } }));

    expect(overrideUpsert.mock.calls[0][0].create.viewId).toBeNull();
    expect(overrideUpsert.mock.calls[0][0].update.viewId).toBeNull();
    expect(overrideUpsert.mock.calls[1][0].create.viewId).toBe(A_VIEW_ID);
    expect(overrideUpsert.mock.calls[1][0].update.viewId).toBe(A_VIEW_ID);
  });

  it("replaces the whole row so a key that left the delta stops overriding", async () => {
    await asTenant(() =>
      new PrismaDataViewOverrideRepo().upsertOverride({
        surfaceKey: SURFACE,
        viewKey: "__all__",
        delta: { columnWidths: { name: 200 } },
      }),
    );

    const { create, update } = overrideUpsert.mock.calls[0][0];

    expect(create.columnWidths).toEqual({ name: 200 });
    expect(create.filters).toBe(Prisma.DbNull);
    expect(update.filters).toBe(Prisma.DbNull);
    expect(create.searchTerm).toBeNull();
    expect(create.pageSize).toBeNull();
  });

  it("writes an explicit cleared value rather than skipping the column", async () => {
    await asTenant(() =>
      new PrismaDataViewOverrideRepo().upsertOverride({
        surfaceKey: SURFACE,
        viewKey: A_VIEW_ID,
        delta: {
          filters: [],
          searchTerm: "",
          sortDescriptor: null,
          grouping: null,
          viewMode: ViewMode.card,
        },
      }),
    );

    const { create } = overrideUpsert.mock.calls[0][0];

    expect(create.filters).toEqual([]);
    expect(create.searchTerm).toBe("");
    expect(create.sortDescriptor).toEqual({});
    expect(create.grouping).toEqual({});
    expect(create.groupingColumnId).toBeNull();
    expect(create.viewMode).toBe("card");
  });

  it("keeps a set grouping descriptor verbatim and derives the shadow column", async () => {
    await asTenant(() =>
      new PrismaDataViewOverrideRepo().upsertOverride({
        surfaceKey: SURFACE,
        viewKey: A_VIEW_ID,
        delta: { grouping: { field: A_GROUPING_COLUMN } },
      }),
    );

    expect(overrideUpsert.mock.calls[0][0].create.grouping).toEqual({ field: A_GROUPING_COLUMN });
    expect(overrideUpsert.mock.calls[0][0].create.groupingColumnId).toBe(A_GROUPING_COLUMN);
  });

  it("deletes only the caller's own row for one surface and view key", async () => {
    await asTenant(() => new PrismaDataViewOverrideRepo().deleteOverride({ surfaceKey: SURFACE, viewKey: "__all__" }));

    expect(overrideDeleteMany).toHaveBeenCalledWith({
      where: { companyId: mockUser.companyId, userId: mockUser.id, surfaceKey: SURFACE, viewKey: "__all__" },
    });
  });
});
