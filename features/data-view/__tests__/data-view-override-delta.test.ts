import type { DataViewDto, DataViewState } from "@/core/data-view/data-view-state.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { runWithTenant } from "@/core/decorators/tenant-context";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({ getTranslations: () => Promise.resolve({ raw: (key: string) => key }) }));

import { ApplyDataViewOverrideInteractor } from "../apply-data-view-override.interactor";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { resolveDataViewState } from "@/core/data-view/resolve-data-view-state";

const SURFACE = "contacts-card-store";
const VIEW_ID = "3a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";
const VIEW_SORT = { field: "createdAt", direction: "desc" as const };

const viewState: DataViewState = {
  filters: [{ field: "firstName", operator: FilterOperatorKey.contains, value: "ada" }],
  sortDescriptor: VIEW_SORT,
  viewMode: ViewMode.card,
  columnWidths: { firstName: 180 },
};

function view(state: DataViewState = viewState): DataViewDto {
  return {
    id: VIEW_ID,
    name: "Hot leads",
    visibility: "workspace",
    position: 0,
    isOwner: false,
    surfaceKey: SURFACE,
    state,
  };
}

function totalStateOf(state: DataViewState): DataViewState {
  const resolved = resolveDataViewState({ view: state });

  return {
    filters: resolved.filters,
    searchTerm: resolved.searchTerm ?? "",
    sortDescriptor: resolved.sortDescriptor ?? null,
    pageSize: resolved.pageSize,
    viewMode: resolved.viewMode,
    groupingColumnId: resolved.groupingColumnId ?? null,
    columnOrder: resolved.columnOrder,
    columnWidths: resolved.columnWidths,
    hiddenColumns: resolved.hiddenColumns,
  };
}

function makeInteractor(found: DataViewDto | null = view()) {
  const views = { findViewById: vi.fn().mockResolvedValue(found) };
  const overrides = {
    upsertOverride: vi.fn().mockResolvedValue(undefined),
    deleteOverride: vi.fn().mockResolvedValue(true),
  };

  return { views, overrides, interactor: new ApplyDataViewOverrideInteractor(views, overrides) };
}

describe("ApplyDataViewOverrideInteractor delta contract", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the row when the incoming total state equals the resolved view", async () => {
    const { interactor, overrides } = makeInteractor();

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, viewKey: VIEW_ID, mode: "save", state: totalStateOf(viewState) }),
    );

    expect(result).toEqual({ ok: true, data: { hasOverride: false } });
    expect(overrides.deleteOverride).toHaveBeenCalledWith({ surfaceKey: SURFACE, viewKey: VIEW_ID });
    expect(overrides.upsertOverride).not.toHaveBeenCalled();
  });

  it("stores exactly the one key that differs from the view", async () => {
    const { interactor, overrides } = makeInteractor();

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({
        surfaceKey: SURFACE,
        viewKey: VIEW_ID,
        mode: "save",
        state: { ...totalStateOf(viewState), columnWidths: { firstName: 400 } },
      }),
    );

    expect(result).toEqual({ ok: true, data: { hasOverride: true } });
    expect(overrides.upsertOverride).toHaveBeenCalledWith({
      surfaceKey: SURFACE,
      viewKey: VIEW_ID,
      delta: { columnWidths: { firstName: 400 } },
    });
  });

  it("stores an explicit empty list when the reader clears a filter the view defines", async () => {
    const { interactor, overrides } = makeInteractor();

    await runWithTenant(mockUser, () =>
      interactor.invoke({
        surfaceKey: SURFACE,
        viewKey: VIEW_ID,
        mode: "save",
        state: { ...totalStateOf(viewState), filters: [] },
      }),
    );

    expect(overrides.upsertOverride.mock.calls[0][0].delta).toEqual({ filters: [] });
  });

  it("lets the un-overridden fields keep tracking the owner's later edits to the view", async () => {
    const { interactor, overrides } = makeInteractor();
    const total = { ...totalStateOf(viewState), columnWidths: { firstName: 400 } };

    await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, viewKey: VIEW_ID, mode: "save", state: total }),
    );
    const delta = overrides.upsertOverride.mock.calls[0][0].delta;

    const editedView: DataViewState = { ...viewState, searchTerm: "beta", viewMode: ViewMode.table };
    const resolved = resolveDataViewState({ override: delta, view: editedView });

    expect(resolved.searchTerm).toBe("beta");
    expect(resolved.viewMode).toBe(ViewMode.table);
    expect(resolved.columnWidths).toEqual({ firstName: 400 });
  });

  it("stores a cleared sort as a present null that drops the view's sort to the defaults floor", async () => {
    const { interactor, overrides } = makeInteractor();

    await runWithTenant(mockUser, () =>
      interactor.invoke({
        surfaceKey: SURFACE,
        viewKey: VIEW_ID,
        mode: "save",
        state: { ...totalStateOf(viewState), sortDescriptor: null },
      }),
    );
    const delta = overrides.upsertOverride.mock.calls[0][0].delta;

    expect(delta).toEqual({ sortDescriptor: null });
    expect(resolveDataViewState({ override: delta, view: viewState }).sortDescriptor).toBeUndefined();
    expect(
      resolveDataViewState({ override: delta, view: viewState, defaults: { sortDescriptor: VIEW_SORT } })
        .sortDescriptor,
    ).toEqual(VIEW_SORT);
  });

  it("deletes the row on reset without reading the view at all", async () => {
    const { interactor, views, overrides } = makeInteractor();

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, viewKey: "__all__", mode: "reset" }),
    );

    expect(result).toEqual({ ok: true, data: { hasOverride: false } });
    expect(views.findViewById).not.toHaveBeenCalled();
    expect(overrides.deleteOverride).toHaveBeenCalledWith({ surfaceKey: SURFACE, viewKey: "__all__" });
  });

  it("resolves the All key against no view layer at all", async () => {
    const { interactor, views, overrides } = makeInteractor();

    await runWithTenant(mockUser, () =>
      interactor.invoke({
        surfaceKey: SURFACE,
        viewKey: "__all__",
        mode: "save",
        state: { ...totalStateOf({}), pageSize: 10 },
      }),
    );

    expect(views.findViewById).not.toHaveBeenCalled();
    expect(overrides.upsertOverride.mock.calls[0][0].delta).toEqual({ pageSize: 10 });
  });

  it("fails as not found for a view key the caller cannot read, and writes nothing", async () => {
    const { interactor, overrides } = makeInteractor(null);

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, viewKey: VIEW_ID, mode: "save", state: totalStateOf({}) }),
    );

    expect(result.ok).toBe(false);
    expect(overrides.upsertOverride).not.toHaveBeenCalled();
    expect(overrides.deleteOverride).not.toHaveBeenCalled();
  });

  it("refuses a page key on the wire", async () => {
    const { interactor } = makeInteractor();

    await expect(
      runWithTenant(mockUser, () =>
        interactor.invoke({
          surfaceKey: SURFACE,
          viewKey: "__all__",
          mode: "save",
          state: { page: 2 },
        } as never),
      ),
    ).rejects.toThrow();
  });
});
