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
  p13nFindUnique,
} = vi.hoisted(() => ({
  dataViewAggregate: vi.fn(),
  dataViewCreate: vi.fn(),
  dataViewDeleteMany: vi.fn(),
  dataViewFindFirst: vi.fn(),
  dataViewFindMany: vi.fn(),
  dataViewUpdateMany: vi.fn(),
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
    p13n: { findUnique: p13nFindUnique },
  },
}));

import { Prisma } from "@/generated/prisma";

import { PrismaDataViewRepo } from "../prisma-data-view.repository";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { runWithTenant } from "@/core/decorators/tenant-context";

const SURFACE = "contacts-card-store";
const A_VIEW_ID = "3a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";
const A_SECOND_VIEW_ID = "3a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f71";
const A_GROUPING_COLUMN = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e";

const TOTAL_STATE = {
  filters: [],
  searchTerm: "",
  sortDescriptor: null,
  pageSize: 25 as const,
  viewMode: ViewMode.card,
  grouping: null,
  columnOrder: [],
  columnWidths: {},
  hiddenColumns: [],
};

const EVERY_STATE_COLUMN = [
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
];

function storedView(overrides: Record<string, unknown> = {}) {
  return {
    id: A_VIEW_ID,
    surfaceKey: SURFACE,
    name: "Hot leads",
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
    ...overrides,
  };
}

function storedPersonalization(overrides: Record<string, unknown> = {}) {
  return {
    activeViewKey: null,
    filters: null,
    searchTerm: null,
    sortDescriptor: null,
    pagination: null,
    viewMode: null,
    groupingColumnId: null,
    grouping: null,
    columnOrder: [],
    columnWidths: null,
    hiddenColumns: [],
    ...overrides,
  };
}

function asTenant<T>(fn: () => Promise<T>) {
  return runWithTenant(mockUser, fn);
}

const ownerWhere = { companyId: mockUser.companyId, surfaceKey: SURFACE, userId: mockUser.id };

describe("PrismaDataViewRepo scoping", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataViewFindMany.mockResolvedValue([]);
    p13nFindUnique.mockResolvedValue(null);
    dataViewFindFirst.mockResolvedValue(null);
    dataViewAggregate.mockResolvedValue({ _max: { position: null } });
    dataViewUpdateMany.mockResolvedValue({ count: 0 });
    dataViewDeleteMany.mockResolvedValue({ count: 0 });
    dataViewCreate.mockResolvedValue(storedView());
  });

  it("lists only the caller's own views of the surface", async () => {
    await asTenant(() => new PrismaDataViewRepo().listDataViews(SURFACE));

    expect(dataViewFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: ownerWhere }));
  });

  it("loads the surface from the caller's own views and the caller's own personalization row", async () => {
    await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(dataViewFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: ownerWhere }));
    expect(p13nFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          companyId_userId_p13nId: { companyId: mockUser.companyId, userId: mockUser.id, p13nId: SURFACE },
          companyId: mockUser.companyId,
        },
      }),
    );
  });

  it("selects no owner join, because a view is only ever shown to the user who made it", async () => {
    await asTenant(() => new PrismaDataViewRepo().listDataViews(SURFACE));

    expect(dataViewFindMany.mock.calls[0][0].select).not.toHaveProperty("user");
    expect(dataViewFindMany.mock.calls[0][0].select).not.toHaveProperty("visibility");
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
    await asTenant(() => new PrismaDataViewRepo().updateOwned({ id: A_VIEW_ID, state: TOTAL_STATE }));

    expect(Object.keys(dataViewUpdateMany.mock.calls[0][0].data).sort()).toEqual(EVERY_STATE_COLUMN);
  });

  it("autosaves a view's state into the caller's own row on the named surface and reports ownership", async () => {
    dataViewUpdateMany.mockResolvedValue({ count: 1 });

    const saved = await asTenant(() =>
      new PrismaDataViewRepo().updateOwnedState({ id: A_VIEW_ID, surfaceKey: SURFACE, state: TOTAL_STATE }),
    );

    expect(saved).toBe(true);
    expect(dataViewUpdateMany.mock.calls[0][0].where).toEqual({
      id: A_VIEW_ID,
      companyId: mockUser.companyId,
      userId: mockUser.id,
      surfaceKey: SURFACE,
    });
    expect(Object.keys(dataViewUpdateMany.mock.calls[0][0].data).sort()).toEqual(EVERY_STATE_COLUMN);
    expect(dataViewFindFirst).not.toHaveBeenCalled();
  });

  it("autosaves only the keys the payload carries, so an omitted key leaves its column alone", async () => {
    dataViewUpdateMany.mockResolvedValue({ count: 1 });

    await asTenant(() =>
      new PrismaDataViewRepo().updateOwnedState({ id: A_VIEW_ID, surfaceKey: SURFACE, state: { pageSize: 10 } }),
    );

    expect(dataViewUpdateMany.mock.calls[0][0].data).toEqual({ pageSize: 10 });
  });

  it("autosaves a cleared value as a present value rather than leaving the column alone", async () => {
    dataViewUpdateMany.mockResolvedValue({ count: 1 });

    await asTenant(() =>
      new PrismaDataViewRepo().updateOwnedState({
        id: A_VIEW_ID,
        surfaceKey: SURFACE,
        state: { filters: [], searchTerm: "", sortDescriptor: null, grouping: null },
      }),
    );

    expect(dataViewUpdateMany.mock.calls[0][0].data).toEqual({
      filters: [],
      searchTerm: "",
      sortDescriptor: {},
      grouping: Prisma.DbNull,
      groupingColumnId: null,
    });
  });

  it("reports an autosave onto a foreign or missing view as not owned", async () => {
    dataViewUpdateMany.mockResolvedValue({ count: 0 });

    const saved = await asTenant(() =>
      new PrismaDataViewRepo().updateOwnedState({ id: A_VIEW_ID, surfaceKey: SURFACE, state: TOTAL_STATE }),
    );

    expect(saved).toBe(false);
  });

  it("carries companyId in data on create", async () => {
    await asTenant(() =>
      new PrismaDataViewRepo().createView({
        surfaceKey: SURFACE,
        name: "Hot leads",
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
    expect(dataViewCreate.mock.calls[0][0].data).not.toHaveProperty("visibility");
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
    dataViewFindMany.mockResolvedValue([]);
    p13nFindUnique.mockResolvedValue(null);
  });

  it("normalizes legacy relation filters on a view and on the All tab alike", async () => {
    const legacy = [{ field: FilterFieldKey.dealIds, operator: FilterOperatorKey.hasNone, value: ["d1"] }];
    dataViewFindMany.mockResolvedValue([storedView({ filters: legacy })]);
    p13nFindUnique.mockResolvedValue(storedPersonalization({ filters: legacy }));

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    const normalized = [{ field: FilterFieldKey.dealIds, operator: FilterOperatorKey.notIn, value: ["d1"] }];
    expect(surface.views[0].state.filters).toEqual(normalized);
    expect(surface.allState.filters).toEqual(normalized);
  });

  it("reads a malformed stored filter entry without throwing", async () => {
    const malformed = [null, { field: FilterFieldKey.dealIds, operator: FilterOperatorKey.hasSome, value: ["d2"] }];
    dataViewFindMany.mockResolvedValue([storedView({ filters: malformed })]);
    p13nFindUnique.mockResolvedValue(storedPersonalization({ filters: malformed }));

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    const tolerated = [null, { field: FilterFieldKey.dealIds, operator: FilterOperatorKey.in, value: ["d2"] }];
    expect(surface.views[0].state.filters).toEqual(tolerated);
    expect(surface.allState.filters).toEqual(tolerated);
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

  it("reads a cleared sort descriptor as a present null and a null grouping as absent", async () => {
    dataViewFindMany.mockResolvedValue([storedView({ sortDescriptor: {}, grouping: null })]);

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(surface.views[0].state).toEqual({ sortDescriptor: null });
    expect("sortDescriptor" in surface.views[0].state).toBe(true);
  });

  it("never lifts the shadow column into a descriptor, whatever the stored layout", async () => {
    dataViewFindMany.mockResolvedValue([
      storedView({ groupingColumnId: A_GROUPING_COLUMN, viewMode: "card" }),
      { ...storedView({ groupingColumnId: A_GROUPING_COLUMN, viewMode: "table" }), id: A_SECOND_VIEW_ID },
    ]);

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(surface.views[0].state).not.toHaveProperty("grouping");
    expect(surface.views[1].state).not.toHaveProperty("grouping");
  });

  it("reads an empty All tab state when the caller has no personalization row yet", async () => {
    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(surface).toEqual({ activeViewKey: null, views: [], allState: {} });
  });

  it("reads the All tab state from the personalization list columns through the shared mapping", async () => {
    p13nFindUnique.mockResolvedValue(
      storedPersonalization({
        activeViewKey: A_VIEW_ID,
        filters: [{ field: "firstName", operator: FilterOperatorKey.contains, value: "ada" }],
        searchTerm: "acme",
        sortDescriptor: { field: "createdAt", direction: "desc" },
        pagination: { page: 3, pageSize: 25 },
        viewMode: "card",
        groupingColumnId: A_GROUPING_COLUMN,
        grouping: { field: A_GROUPING_COLUMN },
        columnOrder: ["firstName", "lastName"],
        columnWidths: { firstName: 220 },
        hiddenColumns: ["createdAt"],
      }),
    );

    const surface = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(surface.activeViewKey).toBe(A_VIEW_ID);
    expect(surface.allState).toEqual({
      filters: [{ field: "firstName", operator: FilterOperatorKey.contains, value: "ada" }],
      searchTerm: "acme",
      sortDescriptor: { field: "createdAt", direction: "desc" },
      pageSize: 25,
      viewMode: "card",
      grouping: { field: A_GROUPING_COLUMN },
      columnOrder: ["firstName", "lastName"],
      columnWidths: { firstName: 220 },
      hiddenColumns: ["createdAt"],
    });
    expect(surface.allState).not.toHaveProperty("page");
  });

  it("lifts only a supported page size out of the personalization pagination", async () => {
    p13nFindUnique.mockResolvedValueOnce(storedPersonalization({ pagination: { page: 2, pageSize: 50 } }));
    const unsupported = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    p13nFindUnique.mockResolvedValueOnce(storedPersonalization({ pagination: { pageSize: 10 } }));
    const supported = await asTenant(() => new PrismaDataViewRepo().loadSurfaceState(SURFACE));

    expect(unsupported.allState).not.toHaveProperty("pageSize");
    expect(supported.allState.pageSize).toBe(10);
  });
});
