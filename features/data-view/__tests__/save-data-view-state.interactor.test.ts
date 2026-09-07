import type { DataViewState } from "@/core/data-view/data-view-state.schema";

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

import { SaveDataViewStateInteractor } from "../save-data-view-state.interactor";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { interactorFailureKind } from "@/core/validation/validation.utils";
import { CustomErrorCode } from "@/core/validation/validation.types";

const SURFACE = "contacts-card-store";
const VIEW_ID = "3a7b2c11-5d4e-4f60-8a91-2b3c4d5e6f70";
const A_GROUPING_COLUMN = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e";

const totalState: DataViewState = {
  filters: [{ field: "firstName", operator: FilterOperatorKey.contains, value: "ada" }],
  searchTerm: "acme",
  sortDescriptor: { field: "createdAt", direction: "desc" },
  pageSize: 25,
  viewMode: ViewMode.card,
  grouping: { field: A_GROUPING_COLUMN },
  columnOrder: ["firstName", "lastName"],
  columnWidths: { firstName: 220 },
  hiddenColumns: ["createdAt"],
};

function doubles(owned = true) {
  const views = { updateOwnedState: vi.fn().mockResolvedValue(owned) };
  const personalization = { upsertP13n: vi.fn().mockResolvedValue(undefined) };

  return { views, personalization, interactor: new SaveDataViewStateInteractor(views, personalization) };
}

function failureCode(result: { ok: boolean; error?: unknown }) {
  const error = (result as { error: { issues: Array<{ params?: { error?: string } }> } }).error;

  return { code: error.issues[0]?.params?.error, kind: interactorFailureKind(error as never) };
}

describe("SaveDataViewStateInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("routes the All tab into the caller's personalization row and never near a view", async () => {
    const { interactor, views, personalization } = doubles();

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, viewKey: ALL_VIEW_KEY, state: totalState }),
    );

    expect(result).toEqual({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    expect(views.updateOwnedState).not.toHaveBeenCalled();
    expect(personalization.upsertP13n).toHaveBeenCalledWith({
      p13nId: SURFACE,
      filters: totalState.filters,
      searchTerm: "acme",
      sortDescriptor: totalState.sortDescriptor,
      pagination: { pageSize: 25 },
      viewMode: ViewMode.card,
      grouping: { field: A_GROUPING_COLUMN },
      columnOrder: ["firstName", "lastName"],
      columnWidths: { firstName: 220 },
      hiddenColumns: ["createdAt"],
    });
  });

  it("routes a named view into the DataView row the caller owns and leaves personalization alone", async () => {
    const { interactor, views, personalization } = doubles();

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, viewKey: VIEW_ID, state: totalState }),
    );

    expect(result).toEqual({ ok: true, data: { viewKey: VIEW_ID } });
    expect(views.updateOwnedState).toHaveBeenCalledWith({ id: VIEW_ID, surfaceKey: SURFACE, state: totalState });
    expect(personalization.upsertP13n).not.toHaveBeenCalled();
  });

  it("refuses a view the caller does not own with the same not found failure a missing id gets", async () => {
    const { interactor, personalization } = doubles(false);

    const result = await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, viewKey: VIEW_ID, state: totalState }),
    );

    expect(result.ok).toBe(false);
    expect(failureCode(result)).toEqual({ code: CustomErrorCode.dataViewNotFound, kind: "not_found" });
    expect(personalization.upsertP13n).not.toHaveBeenCalled();
  });

  it("never persists a page, neither on the wire nor inside the personalization pagination", async () => {
    const { interactor, personalization } = doubles();

    const onTheWire = await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, viewKey: ALL_VIEW_KEY, state: { page: 2, pageSize: 10 } } as never),
    );

    expect(onTheWire.ok).toBe(false);
    expect(personalization.upsertP13n).not.toHaveBeenCalled();

    await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, viewKey: ALL_VIEW_KEY, state: { pageSize: 10 } }),
    );

    expect(personalization.upsertP13n).toHaveBeenCalledWith({ p13nId: SURFACE, pagination: { pageSize: 10 } });
    expect(personalization.upsertP13n.mock.calls[0][0].pagination).not.toHaveProperty("page");
  });

  it("carries cleared values through as present values rather than dropping them", async () => {
    const { interactor, views, personalization } = doubles();
    const cleared: DataViewState = { filters: [], searchTerm: "", sortDescriptor: null, grouping: null };

    await runWithTenant(mockUser, () => interactor.invoke({ surfaceKey: SURFACE, viewKey: VIEW_ID, state: cleared }));
    await runWithTenant(mockUser, () =>
      interactor.invoke({ surfaceKey: SURFACE, viewKey: ALL_VIEW_KEY, state: cleared }),
    );

    expect(views.updateOwnedState.mock.calls[0][0].state).toEqual(cleared);
    expect(personalization.upsertP13n).toHaveBeenCalledWith({ p13nId: SURFACE, ...cleared });
  });

  it("rejects a key that could name, move or share a view", async () => {
    const { interactor, views, personalization } = doubles();

    for (const stray of [{ name: "Stolen" }, { position: 9 }, { visibility: "workspace" }]) {
      const result = await runWithTenant(mockUser, () =>
        interactor.invoke({ surfaceKey: SURFACE, viewKey: VIEW_ID, state: {}, ...stray } as never),
      );

      expect(result.ok).toBe(false);
    }

    expect(views.updateOwnedState).not.toHaveBeenCalled();
    expect(personalization.upsertP13n).not.toHaveBeenCalled();
  });
});
