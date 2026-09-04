import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FilterSchema } from "@/core/base/base-get.schema";
import { ALL_VIEW_KEY, isDataViewSurfaceKey } from "@/core/data-view/data-view-keys";
import { DataViewStateSchema } from "@/core/data-view/data-view-state.schema";

import { SEED_IDS } from "../seeds/context";
import { SYNTHETIC_CUSTOM_COLUMN_IDS, SYNTHETIC_CUSTOM_OPTION_IDS } from "../seeds/custom-fields";
import {
  buildSyntheticDataViewFixtures,
  buildSyntheticDataViewOverrideFixtures,
  personalizationStateToOverrideState,
  persistSyntheticDataViewFixtures,
  SYNTHETIC_DATA_VIEW_ID_PREFIX,
  SYNTHETIC_DATA_VIEW_IDS,
  SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX,
} from "../seeds/data-views";
import { fixtureId } from "../seeds/helpers";
import { buildSyntheticP13nFixtures } from "../seeds/personalization";

const customFields = {
  customColumnIds: SYNTHETIC_CUSTOM_COLUMN_IDS,
  customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
};

const views = () => buildSyntheticDataViewFixtures({ ids: SEED_IDS }, customFields);
const overrides = () => buildSyntheticDataViewOverrideFixtures({ ids: SEED_IDS }, customFields);

type StoredRow = {
  id: string;
  companyId: string;
  userId?: string;
  surfaceKey?: string;
  viewKey?: string;
};

type OverrideWhere = {
  companyId_userId_surfaceKey_viewKey: { companyId: string; userId: string; surfaceKey: string; viewKey: string };
};

function createUpsertRecorder<TWhere>(rowKey: (row: StoredRow) => string, whereKey: (where: TWhere) => string) {
  const rows = new Map<string, StoredRow>();
  const identicalCreateAndUpdate: boolean[] = [];

  const upsert = vi.fn((input: { create: StoredRow; update: Omit<StoredRow, "id">; where: TWhere }) => {
    identicalCreateAndUpdate.push(
      JSON.stringify({ id: input.create.id, ...input.update }) === JSON.stringify(input.create),
    );
    const target = whereKey(input.where);
    const existing = [...rows.values()].find((row) => rowKey(row) === target);
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

function createViewRecorder() {
  return createUpsertRecorder<{ id: string }>(
    (row) => row.id,
    (where) => where.id,
  );
}

function createOverrideRecorder() {
  const compoundKey = (parts: { companyId: string; userId?: string; surfaceKey?: string; viewKey?: string }) =>
    [parts.companyId, parts.userId, parts.surfaceKey, parts.viewKey].join("|");

  return createUpsertRecorder<OverrideWhere>(compoundKey, (where) =>
    compoundKey(where.companyId_userId_surfaceKey_viewKey),
  );
}

function createSeedPrisma(
  viewRecorder: ReturnType<typeof createViewRecorder>,
  overrideRecorder: ReturnType<typeof createOverrideRecorder>,
): Pick<PrismaClient, "dataView" | "dataViewOverride"> {
  return {
    dataView: { deleteMany: viewRecorder.deleteMany, upsert: viewRecorder.upsert },
    dataViewOverride: { deleteMany: overrideRecorder.deleteMany, upsert: overrideRecorder.upsert },
  } as unknown as Pick<PrismaClient, "dataView" | "dataViewOverride">;
}

describe("synthetic data view fixtures", () => {
  it("seeds one shared cross-user view and one All override per list surface", () => {
    const viewFixtures = views();
    const overrideFixtures = overrides();

    expect(viewFixtures).toHaveLength(1);
    expect(overrideFixtures).toHaveLength(10);
    expect(viewFixtures.map(({ id }) => id)).toEqual(Object.values(SYNTHETIC_DATA_VIEW_IDS));
    expect(viewFixtures.every(({ id }) => id.startsWith(`${SYNTHETIC_DATA_VIEW_ID_PREFIX}-`))).toBe(true);
    expect(overrideFixtures.map(({ id }) => id)).toEqual(
      overrideFixtures.map((_, index) => fixtureId(SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX, index + 1)),
    );

    expect(viewFixtures.filter(({ visibility }) => visibility === "workspace").map(({ name }) => name)).toEqual([
      "Open deals",
    ]);
    expect(viewFixtures.every(({ userId }) => userId !== SEED_IDS.user)).toBe(true);
    expect(viewFixtures.find(({ name }) => name === "Open deals")).toMatchObject({
      id: SYNTHETIC_DATA_VIEW_IDS.sharedOpenDeals,
      position: 0,
      surfaceKey: "deals-card-store",
      userId: SEED_IDS.sofiaRossiUser,
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

    for (const fixture of [...viewFixtures, ...overrideFixtures]) {
      expect(DataViewStateSchema.safeParse(fixture.state).success).toBe(true);
      if (fixture.state.filters !== undefined)
        expect(z.array(FilterSchema).safeParse(fixture.state.filters).success).toBe(true);
    }
  });

  it("mirrors every list personalization fixture into its All override", () => {
    const overrideFixtures = overrides();
    const p13nFixtures = buildSyntheticP13nFixtures({ ids: SEED_IDS }, customFields);
    const listFixtures = p13nFixtures.filter(({ p13nId }) => isDataViewSurfaceKey(p13nId));

    expect(overrideFixtures.map(({ surfaceKey }) => surfaceKey)).toEqual(listFixtures.map(({ p13nId }) => p13nId));
    expect(overrideFixtures.every(({ userId, viewKey }) => userId === SEED_IDS.user && viewKey === ALL_VIEW_KEY)).toBe(
      true,
    );

    for (const [index, override] of overrideFixtures.entries())
      expect(override.state).toEqual(personalizationStateToOverrideState(listFixtures[index]));

    const bySurface = new Map(overrideFixtures.map((override) => [override.surfaceKey, override.state]));
    expect(bySurface.get("contacts-card-store")).toEqual({
      columnOrder: [
        "organizations",
        "tasks",
        "deals",
        SYNTHETIC_CUSTOM_COLUMN_IDS.contactSalesPipeline,
        SYNTHETIC_CUSTOM_COLUMN_IDS.contactPhone,
        "channels",
        "updatedAt",
        "createdAt",
        "users",
      ],
      columnWidths: { tasks: 133 },
      filters: [{ field: "userIds", operator: "in", value: [SEED_IDS.user] }],
      hiddenColumns: ["deals", "createdAt"],
      pageSize: 100,
      sortDescriptor: { direction: "asc", field: "name" },
      viewMode: "table",
    });
    expect(bySurface.get("roles-card-store")).toEqual({
      pageSize: 100,
      sortDescriptor: { direction: "asc", field: "type" },
    });
    expect(bySurface.get("audit-logs-card-store")).toMatchObject({ pageSize: 25 });
    expect(bySurface.get("webhook-deliveries-card-store")).toEqual({
      pageSize: 25,
      sortDescriptor: { direction: "desc", field: "createdAt" },
    });
    expect(bySurface.has("contact-detail")).toBe(false);
  });

  it("converges on a second run and removes only stale deterministic rows", async () => {
    const viewFixtures = views();
    const overrideFixtures = overrides();
    const viewRows = createViewRecorder();
    const overrideRows = createOverrideRecorder();

    viewRows.rows.set("unrelated-data-view", { companyId: SEED_IDS.company, id: "unrelated-data-view" });
    viewRows.rows.set(fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 999), {
      companyId: SEED_IDS.company,
      id: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 999),
    });
    overrideRows.rows.set(fixtureId(SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX, 999), {
      companyId: SEED_IDS.company,
      id: fixtureId(SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX, 999),
    });

    const prisma = createSeedPrisma(viewRows, overrideRows);

    await persistSyntheticDataViewFixtures(prisma, SEED_IDS.company, viewFixtures, overrideFixtures);
    const afterFirstRun = new Map([...viewRows.rows, ...overrideRows.rows]);
    await persistSyntheticDataViewFixtures(prisma, SEED_IDS.company, viewFixtures, overrideFixtures);

    expect(new Map([...viewRows.rows, ...overrideRows.rows])).toEqual(afterFirstRun);
    expect(viewRows.identicalCreateAndUpdate.every(Boolean)).toBe(true);
    expect(overrideRows.identicalCreateAndUpdate.every(Boolean)).toBe(true);
    expect(viewRows.rows.has("unrelated-data-view")).toBe(true);
    expect(viewRows.rows.has(fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 999))).toBe(false);
    expect(overrideRows.rows.has(fixtureId(SYNTHETIC_DATA_VIEW_OVERRIDE_ID_PREFIX, 999))).toBe(false);
    expect(viewRows.rows).toHaveLength(viewFixtures.length + 1);
    expect(overrideRows.rows).toHaveLength(overrideFixtures.length);

    await persistSyntheticDataViewFixtures(
      prisma,
      SEED_IDS.company,
      viewFixtures.slice(0, -1),
      overrideFixtures.slice(0, -1),
    );
    expect(viewRows.rows.has(viewFixtures.at(-1)?.id ?? "")).toBe(false);
    expect(overrideRows.rows.has(overrideFixtures.at(-1)?.id ?? "")).toBe(false);
    expect(viewRows.rows.has("unrelated-data-view")).toBe(true);
  });
});
