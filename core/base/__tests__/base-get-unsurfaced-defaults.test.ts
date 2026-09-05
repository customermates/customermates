import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { DataViewStateRepo, SurfaceViewState } from "@/core/data-view/data-view-state.repo";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../base-get.schema";

import { describe, expect, it, vi } from "vitest";

import { BaseGetInteractor, BaseGetRepo } from "../base-get.interactor";
import { SURFACE } from "@/core/data-view/data-view-keys";

vi.mock("@/core/validation/run-precheck", () => ({
  runPrecheck: (data: unknown) => Promise.resolve({ ok: true, data }),
}));

type Item = { id: string };

const SURFACE_DEFAULTS: GetQueryParams = {
  sortDescriptor: { field: "createdAt", direction: "desc" },
  pagination: { page: 1, pageSize: 25 },
};

class StubRepo extends BaseGetRepo<Item> {
  itemCalls: GetQueryParams[] = [];

  getItems(params: GetQueryParams): Promise<Item[]> {
    this.itemCalls.push(params);
    return Promise.resolve([]);
  }

  getCount(): Promise<number> {
    return Promise.resolve(0);
  }

  getSortableFields() {
    return [{ field: "createdAt", resolvedFields: ["createdAt"] }];
  }

  getSearchableFields() {
    return [];
  }

  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve([]);
  }

  getCustomColumns(): Promise<CustomColumnDto[]> {
    return Promise.resolve([]);
  }

  validateFilters({ filters }: { filters: Filter[] | undefined }): Filter[] {
    return filters ?? [];
  }

  validateSortDescriptor({ sortDescriptor }: { sortDescriptor: SortDescriptor | undefined }) {
    return sortDescriptor;
  }

  sumNumericFields<F extends string>(): Promise<Partial<Record<F, number | null>>> {
    return Promise.resolve({} as Partial<Record<F, number | null>>);
  }
}

class ProbeInteractor extends BaseGetInteractor<Item> {}

const emptySurface: SurfaceViewState = { activeViewKey: null, views: [], allState: {} };

function probe(mode: "interactive" | "api") {
  const repo = new StubRepo();
  const viewStateRepo: DataViewStateRepo = { loadSurfaceState: () => Promise.resolve(emptySurface) };
  const interactor = new ProbeInteractor(repo, viewStateRepo, mode, undefined, SURFACE_DEFAULTS, {
    invoke: vi.fn(),
  } as never);

  return { repo, interactor };
}

async function resultOf(mode: "interactive" | "api", params: GetQueryParams) {
  const { repo, interactor } = probe(mode);
  const outcome = await interactor.invoke(params);

  if (!outcome.ok) throw new Error("the probe interactor rejected the request");

  return { data: outcome.data, itemCalls: repo.itemCalls };
}

describe("a request that reaches no data-view surface keeps the documented api contract", () => {
  it("takes the surface defaults when the caller sends no query state of its own", async () => {
    const { data } = await resultOf("api", {});

    expect(data.pagination?.pageSize).toBe(25);
    expect(data.sortDescriptor).toEqual({ field: "createdAt", direction: "desc" });
  });

  it("keeps the hundred row floor and no default sort when the caller sends filters without pagination", async () => {
    const { data, itemCalls } = await resultOf("api", { filters: [] });

    expect(data.pagination?.pageSize).toBe(100);
    expect(data.sortDescriptor).toBeUndefined();
    expect(itemCalls[0]?.pagination?.pageSize).toBe(100);
  });

  it("keeps the hundred row floor for a search term, the way the messaging thread route is wired", async () => {
    const { data } = await resultOf("interactive", { searchTerm: "invoice" });

    expect(data.pagination?.pageSize).toBe(100);
    expect(data.sortDescriptor).toBeUndefined();
  });

  it("honours the caller's own page size over both the surface default and the floor", async () => {
    const { data } = await resultOf("api", { filters: [], pagination: { page: 2, pageSize: 10 } });

    expect(data.pagination).toMatchObject({ page: 2, pageSize: 10 });
  });
});

describe("a request that reaches a data-view surface still layers the surface defaults under the url", () => {
  it("applies the default page size and sort to a page param that carries nothing else", async () => {
    const { data } = await resultOf("interactive", { p13nId: SURFACE.deals, page: 2 });

    expect(data.pagination).toMatchObject({ page: 2, pageSize: 25 });
    expect(data.sortDescriptor).toEqual({ field: "createdAt", direction: "desc" });
  });

  it("applies them alongside filters the url carries, which is what makes a shared link additive", async () => {
    const { data } = await resultOf("interactive", { p13nId: SURFACE.deals, filters: [], page: 2 });

    expect(data.pagination).toMatchObject({ page: 2, pageSize: 25 });
    expect(data.sortDescriptor).toEqual({ field: "createdAt", direction: "desc" });
  });
});
