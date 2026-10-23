import { StubRepo } from "./fixtures/base-get-does-not-persist-stub-repo";
import { ProbeInteractor } from "./fixtures/base-get-does-not-persist-probe-interactor";

import type { DataViewStateRepo, SurfaceViewState } from "@/core/data-view/data-view-state.repo";
import type { DataViewChipDto, DataViewState } from "@/core/data-view/data-view-state.schema";
import type { Filter, GetQueryParams } from "../base-get.schema";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DataViewResultFields } from "../base-get.schema";
import { FilterOperatorKey, ViewMode } from "../base-query-builder";
import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

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

const storedFilters: Filter[] = [{ field: "firstName", operator: FilterOperatorKey.contains, value: "ada" }];

const chip: DataViewChipDto = {
  id: A_VIEW_ID,
  name: "Hot leads",
  position: 0,
  state: { filters: [], searchTerm: "berlin", viewMode: ViewMode.card },
};

const allState: DataViewState = { filters: storedFilters, pageSize: 25 };

function surfaceWithViewAndAllState(): SurfaceViewState {
  return { activeViewKey: null, views: [chip], allState };
}

async function invokeWith(params: GetQueryParams, surface = surfaceWithViewAndAllState()) {
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

  it("keeps the personal All tab filters and the surface default sort when only a page is requested", async () => {
    const { data, repo } = await invokeWith({ p13nId: "contacts-card-store", page: 2 });

    expect(data.filters).toEqual(storedFilters);
    expect(data.sortDescriptor).toEqual({ field: "createdAt", direction: "desc" });
    expect(data.pagination?.page).toBe(2);
    expect(data.pagination?.pageSize).toBe(25);
    expect(repo.itemCalls[0]?.pagination).toEqual({ page: 2, pageSize: 25 });
  });

  it("resolves the All tab against the personal state read from personalization and writes nothing", async () => {
    const { data, touched } = await invokeWith({ p13nId: "contacts-card-store" });

    expect(data.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(data.filters).toEqual(storedFilters);
    expect(data.pagination?.pageSize).toBe(25);
    expect(data.viewMode).toBe(ViewMode.table);
    expect(touched).toEqual(["loadSurfaceState"]);
  });

  it("resolves a named view against its own state alone, never against the All tab state", async () => {
    const { data, touched } = await invokeWith({ p13nId: "contacts-card-store", viewId: A_VIEW_ID });

    expect(data.activeViewKey).toBe(A_VIEW_ID);
    expect(data.filters).toEqual([]);
    expect(data.searchTerm).toBe("berlin");
    expect(data.viewMode).toBe(ViewMode.card);
    expect(data.pagination?.pageSize).toBe(100);
    expect(touched).toEqual(["loadSurfaceState"]);
  });

  it("carries the personal All tab state alongside a named view so the client can switch back without a blank frame", async () => {
    const { data } = await invokeWith({ p13nId: "contacts-card-store", viewId: A_VIEW_ID });

    expect(data.allState).toEqual(allState);
  });

  it("degrades an unreadable view id to the All chip without writing the correction back", async () => {
    const { data, touched } = await invokeWith({
      p13nId: "contacts-card-store",
      viewId: "11111111-1111-4111-8111-111111111111",
    });

    expect(data.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(touched).toEqual(["loadSurfaceState"]);
  });
});

describe("a read with no surface key says nothing about views", () => {
  const undocumentedKeys = Object.keys(DataViewResultFields);
  const documentedButSurfaceOnlyKeys = ["columnOrder", "columnWidths", "hiddenColumns", "viewMode"];

  it("emits none of the fields the documented REST result schema does not declare", async () => {
    const { data } = await invokeWith({ filters: storedFilters, searchTerm: "munich" });

    expect(undocumentedKeys.filter((key) => key in data)).toEqual([]);
  });

  it("emits no layout or view mode projection either", async () => {
    const { data } = await invokeWith({ filters: storedFilters, viewMode: ViewMode.card });

    expect(documentedButSurfaceOnlyKeys.filter((key) => key in data)).toEqual([]);
  });

  it("emits every one of them again as soon as the request names a surface", async () => {
    const { data } = await invokeWith({ p13nId: "contacts-card-store" });

    expect([...undocumentedKeys, ...documentedButSurfaceOnlyKeys].filter((key) => !(key in data))).toEqual([]);
  });
});
