import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FilterSchema } from "@/core/base/base-get.schema";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { DataViewStateSchema } from "@/core/data-view/data-view-state.schema";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { MANUAL_ORDER_SORT_KEY } from "@/features/records/record-column.schema";

import { SEED_IDS } from "../seeds/context";
import {
  SYNTHETIC_CUSTOM_FIELD_IDS,
  SYNTHETIC_CUSTOM_OPTION_IDS,
  type CustomFieldSeedData,
} from "../seeds/custom-fields";
import {
  buildSyntheticDataViewFixtures,
  persistSyntheticDataViewFixtures,
  SYNTHETIC_DATA_VIEW_ID_PREFIX,
  SYNTHETIC_DATA_VIEW_IDS,
} from "../seeds/data-views";
import { fixtureId } from "../seeds/helpers";
import { buildSyntheticP13nFixtures } from "../seeds/personalization";
import { applyNorthwindModel } from "../seeds/northwind-schema";
import { createCrmPreset } from "@/features/records/crm-preset";
import { syntheticRecordKeys } from "../seeds/record-keys";
import {
  NORTHWIND_CUSTOM_TYPE_KEYS,
  NORTHWIND_MEMBER_IDS,
  NORTHWIND_STARTER_TYPE_KEYS,
  northwindModelIds,
} from "../seeds/northwind-model";

const customFields: CustomFieldSeedData = {
  customFields: [],
  customFieldValues: [],
  customFieldIds: SYNTHETIC_CUSTOM_FIELD_IDS,
  customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
};
const model = northwindModelIds(SEED_IDS.company);
const surface = (type: keyof typeof model.types) => `records:${model.types[type]}`;
const LISTS = [...NORTHWIND_STARTER_TYPE_KEYS, ...NORTHWIND_CUSTOM_TYPE_KEYS].filter((type) => type !== "lineItem");
const INBOX = "messaging-threads-card-store";
const DRAFT_FIELD: string = FilterFieldKey.draft;

const views = () => buildSyntheticDataViewFixtures({ ids: SEED_IDS }, customFields);
const own = () => views().filter(({ userId }) => userId === SEED_IDS.user);

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

describe("synthetic data view fixtures", () => {
  it("never references a field the demo seeds in Trash, so data model changes stay unblocked", () => {
    const archived = applyNorthwindModel(createCrmPreset(SEED_IDS.company), SEED_IDS.company)
      .fields.filter((field) => field.archived)
      .map((field) => field.id);
    const states = [
      ...views().map(({ name, state }) => [name, JSON.stringify(state)] as const),
      ...buildSyntheticP13nFixtures({ ids: SEED_IDS }, customFields).map(
        ({ p13nId, ...state }) => [p13nId, JSON.stringify(state)] as const,
      ),
    ];

    expect(archived.length).toBeGreaterThan(0);
    for (const [name, state] of states) {
      expect(
        archived.filter((id) => state.includes(id)),
        name,
      ).toEqual([]);
    }
  });

  it("seeds valid, deterministic views on every Northwind list and the inbox", () => {
    const fixtures = views();

    expect(new Set(fixtures.map(({ id }) => id))).toEqual(new Set(Object.values(SYNTHETIC_DATA_VIEW_IDS)));
    expect(fixtures).toHaveLength(Object.keys(SYNTHETIC_DATA_VIEW_IDS).length);
    expect(fixtures.every(({ id }) => id.startsWith(`${SYNTHETIC_DATA_VIEW_ID_PREFIX}-`))).toBe(true);
    expect(fixtures.every(({ name }) => name.trim().length > 0)).toBe(true);
    expect(new Set(fixtures.map(({ surfaceKey }) => surfaceKey))).toEqual(new Set([...LISTS.map(surface), INBOX]));

    for (const fixture of fixtures) {
      expect(DataViewStateSchema.safeParse(fixture.state).success, fixture.name).toBe(true);
      if (fixture.state.filters !== undefined)
        expect(z.array(FilterSchema).safeParse(fixture.state.filters).success, fixture.name).toBe(true);
    }
  });

  it("gives the demo user two to four views per list, and other members personal views of their own", () => {
    for (const type of LISTS) {
      const count = own().filter(({ surfaceKey }) => surfaceKey === surface(type)).length;
      expect(count, type).toBeGreaterThanOrEqual(2);
      expect(count, type).toBeLessThanOrEqual(4);
    }

    const myTasks = own().find(({ id }) => id === SYNTHETIC_DATA_VIEW_IDS.myTasks);
    expect(myTasks?.name).toBe("My tasks");
    expect(myTasks?.state.filters).toEqual([{ field: "system:assignedTo", operator: "in", value: [SEED_IDS.user] }]);

    const personal = views().filter(({ userId }) => userId !== SEED_IDS.user);
    expect(new Set(personal.map(({ userId }) => userId))).toEqual(
      new Set([
        NORTHWIND_MEMBER_IDS.claraNeumann,
        NORTHWIND_MEMBER_IDS.marcoSilva,
        NORTHWIND_MEMBER_IDS.elenaHoffmann,
        NORTHWIND_MEMBER_IDS.kianRahimi,
        NORTHWIND_MEMBER_IDS.lauraFischer,
      ]),
    );
    for (const view of personal) {
      const mine = (view.state.filters ?? []).some(
        (filter) => "value" in filter && Array.isArray(filter.value) && filter.value.includes(view.userId),
      );
      expect(mine, view.name).toBe(true);
    }
  });

  it("gives every member and surface its own contiguous tab order", () => {
    const bySurface = new Map<string, number[]>();
    for (const { userId, surfaceKey, position } of views())
      bySurface.set(`${userId}:${surfaceKey}`, [...(bySurface.get(`${userId}:${surfaceKey}`) ?? []), position]);

    for (const [key, positions] of bySurface) expect(positions, key).toEqual(positions.map((_, index) => index));
  });

  it("shows boards, grouped tables with date buckets and plain tables", () => {
    const all = views();
    const boards = all.filter(({ state }) => state.viewMode === ViewMode.card);
    const groupedTables = all.filter(({ state }) => state.viewMode === ViewMode.table && state.grouping);
    const plainTables = all.filter(({ state }) => state.viewMode === ViewMode.table && !state.grouping);

    expect(boards.every(({ state }) => Boolean(state.grouping))).toBe(true);
    expect(boards.length).toBeGreaterThan(8);
    expect(groupedTables.length).toBeGreaterThan(8);
    expect(plainTables.length).toBeGreaterThan(8);
    expect(new Set(all.flatMap(({ state }) => state.grouping?.bucket ?? []))).toEqual(new Set(["week", "month"]));
    expect(all.some(({ state }) => state.grouping?.field === model.fields.onboarding.owner)).toBe(true);
    expect(all.some(({ state }) => (state.grouping?.hidden ?? []).length > 0)).toBe(true);
  });

  it("totals groups with every aggregation on money and number fields", () => {
    const summaries = views().flatMap(({ state }) => state.grouping?.summaries ?? []);

    expect(new Set(summaries.map(({ aggregation }) => aggregation))).toEqual(new Set(["sum", "average", "min", "max"]));
    expect(views().find(({ id }) => id === SYNTHETIC_DATA_VIEW_IDS.dealPipeline)?.state.grouping).toMatchObject({
      field: model.fields.deal.stage,
      summaries: [{ fieldId: model.starter.dealTotalValue, aggregation: "sum" }],
    });
  });

  it("filters by choice, member, boolean, relative date, relationship and multiple choice", () => {
    const filters = views().flatMap(({ state }) => state.filters ?? []);
    const operators = new Set(filters.map(({ operator }) => operator));

    for (const operator of [
      FilterOperatorKey.in,
      FilterOperatorKey.notIn,
      FilterOperatorKey.hasAnyOf,
      FilterOperatorKey.hasSome,
      FilterOperatorKey.inLastDays,
      FilterOperatorKey.notInLastDays,
    ])
      expect(operators, operator).toContain(operator);
    expect(filters.some(({ field }) => field === "system:assignedTo")).toBe(true);
    expect(filters.some(({ field }) => field === model.fields.ticket.assignee)).toBe(true);
    expect(filters.some(({ field }) => field === model.fields.ticket.overdue)).toBe(true);
    expect(filters.some(({ field }) => field.startsWith("relationship:"))).toBe(true);
    expect(filters.some(({ field }) => field === DRAFT_FIELD)).toBe(true);
  });

  it("curates columns: order, widths, page size, sorts with manual order and Formatted text excerpts", () => {
    const all = views();

    expect(all.some(({ state }) => state.sortDescriptor?.field === MANUAL_ORDER_SORT_KEY)).toBe(true);
    expect(all.some(({ state }) => Object.keys(state.columnWidths ?? {}).length > 0)).toBe(true);
    expect(all.some(({ state }) => state.pageSize)).toBe(true);
    for (const notes of [
      model.fields.subscription.notes,
      model.fields.ticket.notes,
      model.fields.candidate.interviewNotes,
    ]) {
      const showing = all.filter(({ state }) => state.columnOrder?.includes(notes));
      expect(showing.length, notes).toBeGreaterThan(0);
      expect(showing.every(({ state }) => !(state.hiddenColumns ?? []).includes(notes))).toBe(true);
    }

    for (const view of all.filter(({ surfaceKey }) => surfaceKey !== INBOX)) {
      const hidden = view.state.hiddenColumns ?? [];
      expect(hidden.length, view.name).toBeGreaterThan(3);
      expect(
        (view.state.columnOrder ?? []).filter((column) => hidden.includes(column)),
        view.name,
      ).toEqual([]);
      const type = LISTS.find((candidate) => surface(candidate) === view.surfaceKey);
      expect(type, view.name).toBeDefined();
      expect(hidden, view.name).not.toContain(syntheticRecordKeys(SEED_IDS.company).id(`${type}.name`));
      if (view.state.viewMode === ViewMode.card && view.state.grouping)
        expect(hidden, view.name).toContain(view.state.grouping.field);
    }
  });

  it("keeps boards, tables and group totals small enough for an overview", () => {
    for (const view of views().filter(({ surfaceKey }) => surfaceKey !== INBOX)) {
      const visible = view.state.columnOrder ?? [];
      // A card shows three to five chips (the smallest list, services, shows two); a table four to six columns.
      if (view.state.viewMode === ViewMode.card) {
        expect(visible.length, view.name).toBeGreaterThanOrEqual(2);
        expect(visible.length, view.name).toBeLessThanOrEqual(5);
      } else {
        expect(visible.length, view.name).toBeGreaterThanOrEqual(4);
        expect(visible.length, view.name).toBeLessThanOrEqual(6);
      }
      expect((view.state.grouping?.summaries ?? []).length, view.name).toBeLessThanOrEqual(2);
    }

    expect(views().find(({ id }) => id === SYNTHETIC_DATA_VIEW_IDS.dealPipeline)?.state).toMatchObject({
      columnOrder: [
        model.starter.dealTotalValue,
        syntheticRecordKeys(SEED_IDS.company).relationship("deal.organizations", "outgoing"),
        "system:assignedTo",
        model.fields.deal.openedOn,
      ],
      grouping: {
        summaries: [{ fieldId: model.starter.dealTotalValue, aggregation: "sum" }],
      },
    });
  });

  it("converges on a second run and removes only stale deterministic rows", async () => {
    const fixtures = views();
    const recorder = createViewRecorder();

    recorder.rows.set("unrelated-data-view", {
      companyId: SEED_IDS.company,
      id: "unrelated-data-view",
    });
    recorder.rows.set(fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 999), {
      companyId: SEED_IDS.company,
      id: fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 999),
    });

    const prisma = {
      dataView: { deleteMany: recorder.deleteMany, upsert: recorder.upsert },
    } as unknown as Pick<PrismaClient, "dataView">;

    await persistSyntheticDataViewFixtures(prisma, SEED_IDS.company, fixtures);
    const afterFirstRun = new Map(recorder.rows);
    await persistSyntheticDataViewFixtures(prisma, SEED_IDS.company, fixtures);

    expect(recorder.rows).toEqual(afterFirstRun);
    expect(recorder.identicalCreateAndUpdate.every(Boolean)).toBe(true);
    expect(recorder.rows.has("unrelated-data-view")).toBe(true);
    expect(recorder.rows.has(fixtureId(SYNTHETIC_DATA_VIEW_ID_PREFIX, 999))).toBe(false);
    expect(recorder.rows).toHaveLength(fixtures.length + 1);
    expect(recorder.rows.get(SYNTHETIC_DATA_VIEW_IDS.dealPipeline)).toMatchObject({
      companyId: SEED_IDS.company,
      userId: SEED_IDS.user,
      surfaceKey: surface("deal"),
    });

    await persistSyntheticDataViewFixtures(prisma, SEED_IDS.company, []);
    expect(recorder.rows.has(SYNTHETIC_DATA_VIEW_IDS.dealPipeline)).toBe(false);
    expect(recorder.rows.has("unrelated-data-view")).toBe(true);
  });
});
