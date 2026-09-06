import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FilterSchema } from "@/core/base/base-get.schema";
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
  it("seeds exactly one personal view, owned by the demo user, and no other view rows", () => {
    const fixtures = views();

    expect(fixtures).toHaveLength(1);
    expect(fixtures.map(({ id }) => id)).toEqual(Object.values(SYNTHETIC_DATA_VIEW_IDS));
    expect(fixtures.every(({ id }) => id.startsWith(`${SYNTHETIC_DATA_VIEW_ID_PREFIX}-`))).toBe(true);
    expect(fixtures.every(({ userId }) => userId === SEED_IDS.user)).toBe(true);
    expect(fixtures.every((fixture) => !("visibility" in fixture))).toBe(true);

    expect(fixtures[0]).toEqual({
      id: SYNTHETIC_DATA_VIEW_IDS.openDeals,
      userId: SEED_IDS.user,
      name: "Open deals",
      position: 0,
      surfaceKey: "deals-card-store",
      state: {
        filters: [
          {
            field: SYNTHETIC_CUSTOM_COLUMN_IDS.dealStatus,
            operator: "in",
            value: [SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.open],
          },
        ],
        grouping: { field: SYNTHETIC_CUSTOM_COLUMN_IDS.dealStatus },
        viewMode: "card",
      },
    });

    for (const fixture of fixtures) {
      expect(DataViewStateSchema.safeParse(fixture.state).success).toBe(true);
      if (fixture.state.filters !== undefined)
        expect(z.array(FilterSchema).safeParse(fixture.state.filters).success).toBe(true);
    }
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
