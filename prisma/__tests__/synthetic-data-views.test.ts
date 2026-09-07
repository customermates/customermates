import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FilterSchema } from "@/core/base/base-get.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { ViewMode } from "@/core/base/base-query-builder";
import { DataViewStateSchema } from "@/core/data-view/data-view-state.schema";

import { SEED_IDS } from "../seeds/context";
import { SYNTHETIC_CUSTOM_COLUMN_IDS, SYNTHETIC_CUSTOM_OPTION_IDS } from "../seeds/custom-fields";
import {
  buildSyntheticDataViewFixtures,
  persistSyntheticDataViewFixtures,
  SYNTHETIC_DATA_VIEW_ID_PREFIX,
  SYNTHETIC_DATA_VIEW_IDS,
} from "../seeds/data-views";
import { fixtureId } from "../seeds/helpers";

const customFields = {
  customColumnIds: SYNTHETIC_CUSTOM_COLUMN_IDS,
  customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
};

const views = () => buildSyntheticDataViewFixtures({ ids: SEED_IDS }, customFields);

const DRAFT_FIELD: string = FilterFieldKey.draft;

type StoredRow = {
  id: string;
  companyId: string;
  userId?: string;
  surfaceKey?: string;
};

function createViewRecorder() {
  const rows = new Map<string, StoredRow>();
  const identicalCreateAndUpdate: boolean[] = [];

  const upsert = vi.fn((input: { create: StoredRow; update: Omit<StoredRow, "id">; where: { id: string } }) => {
    identicalCreateAndUpdate.push(
      JSON.stringify({ id: input.create.id, ...input.update }) === JSON.stringify(input.create),
    );
    const existing = rows.get(input.where.id);
    const row = existing ? { ...existing, ...input.update } : input.create;
    rows.set(row.id, row);
    return Promise.resolve(row);
  });

  const deleteMany = vi.fn((input: { where: { companyId: string; id: { startsWith: string; notIn: string[] } } }) => {
    const keep = new Set(input.where.id.notIn);
    let count = 0;
    for (const [id, row] of rows) {
      if (row.companyId !== input.where.companyId || !id.startsWith(input.where.id.startsWith) || keep.has(id))
        continue;
      rows.delete(id);
      count += 1;
    }
    return Promise.resolve({ count });
  });

  return { deleteMany, identicalCreateAndUpdate, rows, upsert };
}

function createSeedPrisma(recorder: ReturnType<typeof createViewRecorder>): Pick<PrismaClient, "dataView"> {
  return {
    dataView: { deleteMany: recorder.deleteMany, upsert: recorder.upsert },
  } as unknown as Pick<PrismaClient, "dataView">;
}

describe("synthetic data view fixtures", () => {
  it("seeds personal views across every demo surface, owned by the demo user", () => {
    const fixtures = views();

    expect(fixtures.map(({ id }) => id)).toEqual(Object.values(SYNTHETIC_DATA_VIEW_IDS));
    expect(fixtures.every(({ id }) => id.startsWith(`${SYNTHETIC_DATA_VIEW_ID_PREFIX}-`))).toBe(true);
    expect(fixtures.every(({ userId }) => userId === SEED_IDS.user)).toBe(true);
    expect(fixtures.every((fixture) => !("visibility" in fixture))).toBe(true);
    expect(fixtures.every(({ name }) => name.trim().length > 0)).toBe(true);

    expect(new Set(fixtures.map(({ surfaceKey }) => surfaceKey))).toEqual(
      new Set([
        "contacts-card-store",
        "organizations-card-store",
        "deals-card-store",
        "services-card-store",
        "tasks-card-store",
        "messaging-threads-card-store",
      ]),
    );

    for (const fixture of fixtures) {
      expect(DataViewStateSchema.safeParse(fixture.state).success, fixture.name).toBe(true);
      if (fixture.state.filters !== undefined)
        expect(z.array(FilterSchema).safeParse(fixture.state.filters).success, fixture.name).toBe(true);
    }
  });

  it("gives every surface its own contiguous tab order", () => {
    const bySurface = new Map<string, number[]>();
    for (const { surfaceKey, position } of views())
      bySurface.set(surfaceKey, [...(bySurface.get(surfaceKey) ?? []), position]);

    for (const [surfaceKey, positions] of bySurface) {
      expect(positions.length, surfaceKey).toBeGreaterThan(1);
      expect(
        [...positions].sort((left, right) => left - right),
        surfaceKey,
      ).toEqual(positions.map((_, index) => index));
    }
  });

  it("shows a pipeline on every surface that can group, and filters the one that cannot", () => {
    const grouped = views().filter(({ state }) => state.grouping);

    expect(new Set(grouped.map(({ surfaceKey }) => surfaceKey))).toEqual(
      new Set([
        "contacts-card-store",
        "organizations-card-store",
        "deals-card-store",
        "services-card-store",
        "tasks-card-store",
      ]),
    );

    const inbox = views().filter(({ surfaceKey }) => surfaceKey === "messaging-threads-card-store");

    expect(inbox.every(({ state }) => !state.grouping)).toBe(true);
    expect(inbox.every(({ state }) => (state.filters ?? []).length > 0)).toBe(true);
    expect(inbox.some(({ state }) => (state.filters ?? []).some((filter) => filter.field === DRAFT_FIELD))).toBe(true);
  });

  it("varies the appearance, so the demo shows boards, grouped tables and plain tables", () => {
    const all = views();
    const boards = all.filter(({ state }) => state.viewMode === ViewMode.card);
    const groupedTables = all.filter(({ state }) => state.viewMode === ViewMode.table && state.grouping);
    const plainTables = all.filter(({ state }) => state.viewMode === ViewMode.table && !state.grouping);

    expect(boards.every(({ state }) => Boolean(state.grouping))).toBe(true);
    expect(boards.length).toBeGreaterThan(4);
    expect(groupedTables.length).toBeGreaterThan(0);
    expect(plainTables.length).toBeGreaterThan(4);

    const kinds = new Set(
      all.flatMap(({ state }) => (state.grouping ? [state.grouping.bucket ? "dateBucket" : "field"] : [])),
    );

    expect(kinds).toEqual(new Set(["field", "dateBucket"]));
  });

  it("curates the columns on every board, so a card is not a dump of every field", () => {
    const boards = views().filter(({ state }) => state.viewMode === ViewMode.card);

    expect(boards.length).toBeGreaterThan(4);
    for (const boardView of boards) {
      expect((boardView.state.hiddenColumns ?? []).length, boardView.name).toBeGreaterThan(3);
      const groupingField = boardView.state.grouping?.field;
      if (groupingField && !groupingField.endsWith("Ids"))
        expect(boardView.state.hiddenColumns, boardView.name).toContain(groupingField);
    }
  });

  it("carries real column settings, not just filters", () => {
    const all = views();

    expect(all.some(({ state }) => (state.columnOrder ?? []).length > 0)).toBe(true);
    expect(all.some(({ state }) => (state.hiddenColumns ?? []).length > 0)).toBe(true);
    expect(all.some(({ state }) => Object.keys(state.columnWidths ?? {}).length > 0)).toBe(true);
    expect(all.some(({ state }) => state.sortDescriptor)).toBe(true);
    expect(all.some(({ state }) => state.pageSize)).toBe(true);
    expect(all.every(({ state }) => !(state.hiddenColumns ?? []).includes("name"))).toBe(true);
  });

  it("converges on a second run and removes only stale deterministic rows", async () => {
    const fixtures = views();
    const recorder = createViewRecorder();

    recorder.rows.set("unrelated-data-view", { companyId: SEED_IDS.company, id: "unrelated-data-view" });
    recorder.rows.set(fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 999), {
      companyId: SEED_IDS.company,
      id: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 999),
    });

    const prisma = createSeedPrisma(recorder);

    await persistSyntheticDataViewFixtures(prisma, SEED_IDS.company, fixtures);
    const afterFirstRun = new Map(recorder.rows);
    await persistSyntheticDataViewFixtures(prisma, SEED_IDS.company, fixtures);

    expect(recorder.rows).toEqual(afterFirstRun);
    expect(recorder.identicalCreateAndUpdate.every(Boolean)).toBe(true);
    expect(recorder.rows.has("unrelated-data-view")).toBe(true);
    expect(recorder.rows.has(fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 999))).toBe(false);
    expect(recorder.rows).toHaveLength(fixtures.length + 1);
    expect(recorder.rows.get(SYNTHETIC_DATA_VIEW_IDS.openDeals)).toMatchObject({
      companyId: SEED_IDS.company,
      userId: SEED_IDS.user,
      surfaceKey: "deals-card-store",
    });

    await persistSyntheticDataViewFixtures(prisma, SEED_IDS.company, []);
    expect(recorder.rows.has(SYNTHETIC_DATA_VIEW_IDS.openDeals)).toBe(false);
    expect(recorder.rows.has("unrelated-data-view")).toBe(true);
  });
});
