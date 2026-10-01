import { StubRepo } from "./fixtures/base-get-sort-fallback-stub-repo";
import { ProbeInteractor } from "./fixtures/base-get-sort-fallback-probe-interactor";

import type { DataViewStateRepo, SurfaceViewState } from "@/core/data-view/data-view-state.repo";
import type { GetQueryParams, SortDescriptor } from "../base-get.schema";

import { describe, expect, it, vi } from "vitest";

import { SURFACE } from "@/core/data-view/data-view-keys";

vi.mock("@/core/validation/run-precheck", () => ({
  runPrecheck: (data: unknown) => Promise.resolve({ ok: true, data }),
}));

const DEFAULT_SORT: SortDescriptor = { field: "createdAt", direction: "desc" };
const SAVED_SORT: SortDescriptor = { field: "name", direction: "desc" };
const UNSUPPORTED_SORT: SortDescriptor = { field: "email", direction: "asc" };

const SURFACE_DEFAULTS: GetQueryParams = {
  sortDescriptor: DEFAULT_SORT,
  pagination: { page: 1, pageSize: 25 },
};

async function resultOf(savedSort: SortDescriptor | null, params: GetQueryParams) {
  const repo = new StubRepo();
  const surface: SurfaceViewState = { activeViewKey: null, views: [], allState: { sortDescriptor: savedSort } };
  const viewStateRepo: DataViewStateRepo = { loadSurfaceState: () => Promise.resolve(surface) };
  const interactor = new ProbeInteractor(repo, viewStateRepo, "interactive", undefined, SURFACE_DEFAULTS);
  const outcome = await interactor.invoke(params);

  if (!outcome.ok) throw new Error("the probe interactor rejected the request");

  return { data: outcome.data, itemCalls: repo.itemCalls };
}

describe("a sort the repository cannot use falls back to the next layer", () => {
  it("applies the saved sort when the url names a field that cannot be sorted", async () => {
    const { data, itemCalls } = await resultOf(SAVED_SORT, {
      p13nId: SURFACE.users,
      sortDescriptor: UNSUPPORTED_SORT,
    });

    expect(data.sortDescriptor).toEqual(SAVED_SORT);
    expect(itemCalls[0]?.sortDescriptor).toEqual(SAVED_SORT);
  });

  it("applies the default sort when the saved sort cannot be used either", async () => {
    const { data, itemCalls } = await resultOf(UNSUPPORTED_SORT, {
      p13nId: SURFACE.users,
      sortDescriptor: { field: "bogus", direction: "asc" },
    });

    expect(data.sortDescriptor).toEqual(DEFAULT_SORT);
    expect(itemCalls[0]?.sortDescriptor).toEqual(DEFAULT_SORT);
  });

  it("applies the default sort when the saved sort alone cannot be used", async () => {
    const { data } = await resultOf(UNSUPPORTED_SORT, { p13nId: SURFACE.users });

    expect(data.sortDescriptor).toEqual(DEFAULT_SORT);
  });

  it("keeps a supported url sort over the saved one", async () => {
    const { data } = await resultOf(SAVED_SORT, {
      p13nId: SURFACE.users,
      sortDescriptor: { field: "createdAt", direction: "asc" },
    });

    expect(data.sortDescriptor).toEqual({ field: "createdAt", direction: "asc" });
  });
});
