import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { DataViewStateRepo, SurfaceViewState } from "@/core/data-view/data-view-state.repo";
import type { DataViewChipDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type { Filter, FilterableField, GetQueryParams, SortDescriptor } from "../base-get.schema";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EntityType, Prisma } from "@/generated/prisma";

import { BaseGetInteractor, BaseGetRepo } from "../base-get.interactor";
import { DataViewResultFields } from "../base-get.schema";
import { FilterOperatorKey, ViewMode } from "../base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

type Item = { id: string };

const A_VIEW_ID = "6b2f4e10-7c3a-4d51-9f28-1a2b3c4d5e6f";

function viewStateRepoRecordingEveryTouchedMember(surface: SurfaceViewState) {
  const touched: string[] = [];

  const repo = new Proxy({} as DataViewStateRepo, {
    get(_target, property) {
      const member = String(property);
      touched.push(member);
      if (member === "loadSurfaceState") return () => Promise.resolve(surface);
      return undefined;
    },
  });

  return { repo, touched };
}

class StubRepo extends BaseGetRepo<Item> {
  itemCalls: GetQueryParams[] = [];

  getItems(params: GetQueryParams): Promise<Item[]> {
    this.itemCalls.push(params);
    return Promise.resolve([{ id: "one" }]);
  }

  getCount(): Promise<number> {
    return Promise.resolve(1);
  }

  getSortableFields() {
    return [
      { field: "createdAt", resolvedFields: ["createdAt"] },
      { field: "name", resolvedFields: ["name"] },
    ];
  }

  getSearchableFields() {
    return [];
  }

  getFilterableFields(): Promise<FilterableField[]> {
    return Promise.resolve([{ field: "firstName", operators: [FilterOperatorKey.contains] }]);
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

class ProbeInteractor extends BaseGetInteractor<Item> {
  constructor(viewStateRepo: DataViewStateRepo, repo: StubRepo) {
    super(repo, viewStateRepo, "interactive", EntityType.contact, {
      sortDescriptor: { field: "createdAt", direction: Prisma.SortOrder.desc },
    });
  }
}

const storedFilters: Filter[] = [{ field: "firstName", operator: FilterOperatorKey.contains, value: "ada" }];

const chip: DataViewChipDto = {
  id: A_VIEW_ID,
  name: "Hot leads",
  visibility: "private",
  position: 0,
  isOwner: true,
  ownerName: "Max Mustermann",
  state: { filters: [], searchTerm: "berlin", viewMode: ViewMode.card },
};

const allOverride: DataViewState = { filters: storedFilters, pageSize: 25 };

function surfaceWithViewAndOverride(): SurfaceViewState {
  return {
    activeViewKey: null,
    views: [chip],
    overrides: new Map<string, DataViewState>([[ALL_VIEW_KEY, allOverride]]),
  };
}

async function invokeWith(params: GetQueryParams, surface = surfaceWithViewAndOverride()) {
  const { repo: viewStateRepo, touched } = viewStateRepoRecordingEveryTouchedMember(surface);
  const repo = new StubRepo();
  const result = await new ProbeInteractor(viewStateRepo, repo).invoke(params);

  if (!result.ok) throw new Error("the probe interactor was expected to succeed");

  return { data: result.data, touched, repo };
}

describe("a GET never persists what the user is looking at", () => {
  it("touches only loadSurfaceState on the state repository for a full interactive invoke", async () => {
    const { touched } = await invokeWith({
      p13nId: "contacts-card-store",
      viewId: A_VIEW_ID,
      page: 3,
      pageSize: 10,
      searchTerm: "munich",
      viewMode: ViewMode.table,
    });

    expect(touched).toEqual(["loadSurfaceState"]);
  });

  it("touches nothing at all on the state repository when the URL carries query state but no surface", async () => {
    const { touched } = await invokeWith({
      filters: storedFilters,
      searchTerm: "munich",
      pagination: { page: 2, pageSize: 25 },
    });

    expect(touched).toEqual([]);
  });

  it("offers no write method to call, on the port or on the abstract class", () => {
    const source = readFileSync(join(process.cwd(), "core/data-view/data-view-state.repo.ts"), "utf8");
    const declaredMembers = [...source.matchAll(/^\s*abstract\s+(\w+)/gm)].map((match) => match[1]);

    expect(declaredMembers).toEqual(["loadSurfaceState"]);

    const interactorSource = readFileSync(join(process.cwd(), "core/base/base-get.interactor.ts"), "utf8");

    expect(interactorSource).not.toMatch(/\bupsert|\bupdate\w*\(|\bdelete\w*\(/i);
  });

  it("keeps the stored override filters and the surface default sort when only a page is requested", async () => {
    const { data, repo } = await invokeWith({ p13nId: "contacts-card-store", page: 2 });

    expect(data.filters).toEqual(storedFilters);
    expect(data.sortDescriptor).toEqual({ field: "createdAt", direction: "desc" });
    expect(data.pagination?.page).toBe(2);
    expect(data.pagination?.pageSize).toBe(25);
    expect(repo.itemCalls[0]?.pagination).toEqual({ page: 2, pageSize: 25 });
  });

  it("reports the override as dirty without writing anything to clear or confirm it", async () => {
    const { data, touched } = await invokeWith({ p13nId: "contacts-card-store" });

    expect(data.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(data.viewIsDirty).toBe(true);
    expect(data.viewUnavailable).toBe(false);
    expect(touched).toEqual(["loadSurfaceState"]);
  });

  it("degrades an unreadable view id to the All chip without writing the correction back", async () => {
    const { data, touched } = await invokeWith({
      p13nId: "contacts-card-store",
      viewId: "11111111-1111-4111-8111-111111111111",
    });

    expect(data.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(data.viewUnavailable).toBe(true);
    expect(touched).toEqual(["loadSurfaceState"]);
  });
});

describe("a read with no surface key says nothing about views", () => {
  const undocumentedKeys = Object.keys(DataViewResultFields);
  const documentedButSurfaceOnlyKeys = [
    "columnOrder",
    "columnWidths",
    "hiddenColumns",
    "viewMode",
    "groupingColumnId",
    "savedFilterPresets",
  ];

  it("emits none of the fields the documented REST result schema does not declare", async () => {
    const { data } = await invokeWith({ filters: storedFilters, searchTerm: "munich" });

    expect(undocumentedKeys.filter((key) => key in data)).toEqual([]);
  });

  it("emits no layout, view mode or preset projection either", async () => {
    const { data } = await invokeWith({ filters: storedFilters, viewMode: ViewMode.card });

    expect(documentedButSurfaceOnlyKeys.filter((key) => key in data)).toEqual([]);
  });

  it("emits every one of them again as soon as the request names a surface", async () => {
    const { data } = await invokeWith({ p13nId: "contacts-card-store" });

    expect([...undocumentedKeys, ...documentedButSurfaceOnlyKeys].filter((key) => !(key in data))).toEqual([]);
  });
});
