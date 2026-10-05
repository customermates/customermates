import { FailClosedRepo } from "./fixtures/resolve-grouping-fail-closed-repo";
import { GroupedSurface } from "./fixtures/resolve-grouping-grouped-surface";
import { UngroupableSurface } from "./fixtures/resolve-grouping-ungroupable-surface";

import type { GetQueryParams } from "../base-get.schema";

import { describe, expect, it } from "vitest";

import { ViewMode } from "../base-query-builder";

const LIVE_COLUMN_ID = "11111111-1111-4111-8111-111111111111";
const DELETED_COLUMN_ID = "22222222-2222-4222-8222-222222222222";

async function run(
  params: GetQueryParams,
  options: { relations?: boolean; ungroupable?: boolean } = {},
): Promise<{ repo: FailClosedRepo; data: Awaited<ReturnType<GroupedSurface["invoke"]>> }> {
  const repo = new FailClosedRepo(options.relations ?? false, !options.ungroupable);
  const interactor = options.ungroupable ? new UngroupableSurface(repo) : new GroupedSurface(repo);
  const data = await interactor.invoke({ viewMode: ViewMode.card, ...params });

  return { repo, data };
}

function grouped(data: Awaited<ReturnType<GroupedSurface["invoke"]>>) {
  if (!data.ok) throw new Error("the fail closed surface was expected to answer");

  return data.data;
}

describe("an unresolvable grouping descriptor degrades to a flat read", () => {
  it("groups when the descriptor names a column the surface still has", async () => {
    const { repo, data } = await run({ grouping: { field: LIVE_COLUMN_ID } });

    expect(grouped(data).grouping?.grouping).toEqual({ field: LIVE_COLUMN_ID });
    expect(repo.axisCalls).toBe(1);
  });

  it("returns no grouping and never touches the axis for a deleted custom column", async () => {
    const { repo, data } = await run({ grouping: { field: DELETED_COLUMN_ID } });

    expect(grouped(data).grouping).toBeUndefined();
    expect(repo.axisCalls).toBe(0);
    expect(repo.itemCalls[0]?.groupScope).toBeUndefined();
  });

  it("returns no grouping for a relation the surface does not offer this viewer", async () => {
    const withRelation = await run({ grouping: { field: "contactIds" } }, { relations: true });

    expect(grouped(withRelation.data).grouping?.kind).toBe("relation");

    const withoutRelation = await run({ grouping: { field: "contactIds" } }, { relations: false });

    expect(grouped(withoutRelation.data).grouping).toBeUndefined();
    expect(withoutRelation.repo.axisCalls).toBe(0);
  });

  it("returns no grouping for a field the surface never declared", async () => {
    const { repo, data } = await run({ grouping: { field: "type" } });

    expect(grouped(data).grouping).toBeUndefined();
    expect(grouped(data).groupableFields?.some((field) => field.id === "type")).not.toBe(true);
    expect(repo.axisCalls).toBe(0);
  });

  it("offers and resolves nothing at all on a surface whose repository declares no groupable field", async () => {
    const { repo, data } = await run({ grouping: { field: LIVE_COLUMN_ID } }, { ungroupable: true });

    expect(grouped(data).grouping).toBeUndefined();
    expect(grouped(data).groupableFields).toBeUndefined();
    expect(repo.axisCalls).toBe(0);
  });

  it("lifts a legacy grouped pagination request that carries no descriptor", async () => {
    const { repo, data } = await run({
      groupedPagination: { groupingColumnId: LIVE_COLUMN_ID, perGroup: 5 },
    } as unknown as GetQueryParams);

    expect(grouped(data).grouping?.grouping).toEqual({ field: LIVE_COLUMN_ID });
    expect(repo.axisCalls).toBe(1);
  });

  it("degrades a legacy request naming a deleted column instead of failing the read", async () => {
    const { repo, data } = await run({
      groupedPagination: { groupingColumnId: DELETED_COLUMN_ID, perGroup: 5 },
    } as unknown as GetQueryParams);

    expect(data.ok).toBe(true);
    expect(grouped(data).grouping).toBeUndefined();
    expect(repo.axisCalls).toBe(0);
  });
});
