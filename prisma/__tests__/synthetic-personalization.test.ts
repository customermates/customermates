import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { FilterSchema, PaginationRequestSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { ViewMode } from "@/core/base/base-query-builder";
import { EntityDetailOptionsSchema } from "@/features/p13n/p13n.schema";
import { GroupingSchema } from "@/core/base/grouping/grouping.schema";
import { groupingShadowColumnId } from "@/core/base/grouping/stored-grouping";

import { SEED_IDS } from "../seeds/context";
import {
  SYNTHETIC_CUSTOM_FIELD_IDS,
  SYNTHETIC_CUSTOM_OPTION_IDS,
  type CustomFieldSeedData,
} from "../seeds/custom-fields";
import { fixtureId } from "../seeds/helpers";
import { northwindColumns } from "../seeds/northwind-columns";
import { NORTHWIND_CUSTOM_TYPE_KEYS, northwindModelIds } from "../seeds/northwind-model";
import { syntheticRecordKeys } from "../seeds/record-keys";
import {
  buildSyntheticP13nFixtures,
  persistSyntheticP13nFixtures,
  SYNTHETIC_P13N_IDS,
  SYNTHETIC_P13N_ID_PREFIX,
  type SyntheticP13nFixture,
} from "../seeds/personalization";

const customFields: CustomFieldSeedData = {
  customFields: [],
  customFieldValues: [],
  customFieldIds: SYNTHETIC_CUSTOM_FIELD_IDS,
  customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
};
const { id, surface, relationship, path } = syntheticRecordKeys(SEED_IDS.company);
const C = SYNTHETIC_CUSTOM_FIELD_IDS;
const { fields: f } = northwindModelIds(SEED_IDS.company);
const dealStage = f.deal.stage;
const columns = northwindColumns(SEED_IDS.company, C);
const LISTS = ["contact", "organization", "deal", "service", "task", ...NORTHWIND_CUSTOM_TYPE_KEYS] as const;

describe("synthetic personalization fixtures", () => {
  it("keeps every list All state unfiltered, so All shows every record", () => {
    const fixtures = buildSyntheticP13nFixtures({ ids: SEED_IDS }, customFields);
    const lists = fixtures.filter(({ p13nId }) => p13nId.startsWith("records:"));
    expect(lists).toHaveLength(LISTS.length);
    for (const fixture of lists) expect(fixture.filters, fixture.p13nId).toEqual([]);
  });

  it("seeds list and record-detail personalization with deterministic field, option and user IDs", () => {
    const fixtures = buildSyntheticP13nFixtures({ ids: SEED_IDS }, customFields);
    const byP13nId = new Map(fixtures.map((fixture) => [fixture.p13nId, fixture]));

    expect(fixtures).toHaveLength(30);
    expect(fixtures.map(({ p13nId }) => p13nId)).toEqual([
      surface("contact"),
      "users-card-store",
      surface("task"),
      "roles-card-store",
      "webhooks-card-store",
      surface("deal"),
      surface("service"),
      "webhook-deliveries-card-store",
      surface("organization"),
      "dashboard",
      "routines-card-store",
      ...NORTHWIND_CUSTOM_TYPE_KEYS.map((type) => surface(type)),
      ...LISTS.map((type) => `record-detail:${id(type)}`),
    ]);
    expect(new Set(fixtures.map(({ id }) => id))).toEqual(new Set(Object.values(SYNTHETIC_P13N_IDS)));
    expect(fixtures.every(({ companyId, userId }) => companyId === SEED_IDS.company && userId === SEED_IDS.user)).toBe(
      true,
    );
    for (const fixture of fixtures) {
      if (fixture.filters !== undefined) expect(z.array(FilterSchema).safeParse(fixture.filters).success).toBe(true);
      if (fixture.sortDescriptor !== undefined)
        expect(SortDescriptorSchema.safeParse(fixture.sortDescriptor).success).toBe(true);

      if (fixture.pagination !== undefined) {
        expect(PaginationRequestSchema.pick({ pageSize: true }).strict().safeParse(fixture.pagination).success).toBe(
          true,
        );
      }
      if (fixture.viewMode !== undefined && fixture.viewMode !== null)
        expect(z.enum(ViewMode).safeParse(fixture.viewMode).success).toBe(true);
      if (fixture.groupingColumnId !== undefined && fixture.groupingColumnId !== null) {
        expect(fixture.groupingColumnId === "ownerUserId" || z.uuid().safeParse(fixture.groupingColumnId).success).toBe(
          true,
        );
      }
      const grouping = GroupingSchema.safeParse(fixture.grouping);
      expect([fixture.p13nId, grouping.success]).toEqual([
        fixture.p13nId,
        fixture.groupingColumnId !== undefined && fixture.groupingColumnId !== null,
      ]);
      if (grouping.success) {
        const expectedShadowColumnId = z.uuid().safeParse(fixture.groupingColumnId).success
          ? fixture.groupingColumnId
          : null;
        expect([fixture.p13nId, groupingShadowColumnId(grouping.data)]).toEqual([
          fixture.p13nId,
          expectedShadowColumnId,
        ]);
      }
      if (fixture.detailOptions !== undefined)
        expect(EntityDetailOptionsSchema.safeParse(fixture.detailOptions).success).toBe(true);
    }

    expect(byP13nId.get(surface("contact"))).toMatchObject({
      columnOrder: [
        f.contact.jobTitle,
        relationship("contact.organizations", "outgoing"),
        C.contactSalesPipeline,
        id("capability.identity"),
      ],
      columnWidths: { [f.contact.jobTitle]: 220 },
      filters: [],
      pagination: { pageSize: 100 },
      sortDescriptor: { direction: "asc", field: id("contact.name") },
      viewMode: "table",
    });
    expect(byP13nId.get(surface("task"))).toMatchObject({
      columnOrder: [f.task.dueDate, C.taskPriority, relationship("task.deals", "outgoing")],
      filters: [],
      groupingColumnId: C.taskStatus,
      viewMode: "card",
    });
    expect(byP13nId.get(surface("deal"))).toMatchObject({
      columnOrder: [
        id("deal.totalValue"),
        relationship("deal.organizations", "outgoing"),
        "system:assignedTo",
        f.deal.openedOn,
      ],
      groupingColumnId: dealStage,
      grouping: {
        field: dealStage,
        summaries: [{ fieldId: id("deal.totalValue"), aggregation: "sum" }],
      },
      viewMode: "card",
    });
    expect(byP13nId.get("dashboard")).toMatchObject({
      activeViewKey: ALL_VIEW_KEY,
    });
    expect(byP13nId.get(surface("service"))).toMatchObject({
      columnOrder: [C.serviceType, id("service.amount"), C.servicePricing, path("service.deals.path")],
      viewMode: "table",
    });
    expect(byP13nId.get(surface("organization"))).toMatchObject({
      columnOrder: [
        C.organizationType,
        f.organization.industry,
        f.organization.segment,
        f.organization.arr,
        "system:assignedTo",
      ],
      columnWidths: { [id("organization.name")]: 260 },
      viewMode: "table",
    });
    expect(byP13nId.get("routines-card-store")).toMatchObject({
      filters: [],
      groupingColumnId: "ownerUserId",
      grouping: { field: "ownerUserId" },
      hiddenColumns: [],
      pagination: { pageSize: 100 },
      sortDescriptor: { direction: "desc", field: "createdAt" },
      viewMode: "table",
    });

    expect(byP13nId.get("users-card-store")).toMatchObject({
      columnWidths: { role: 108 },
      hiddenColumns: ["email"],
      pagination: { pageSize: 100 },
      sortDescriptor: { direction: "desc", field: "name" },
      viewMode: "table",
    });
    expect(byP13nId.get("roles-card-store")).toMatchObject({
      pagination: { pageSize: 100 },
      sortDescriptor: { direction: "asc", field: "type" },
      viewMode: null,
    });
    expect(byP13nId.get("webhooks-card-store")).toMatchObject({
      pagination: { pageSize: 100 },
      sortDescriptor: { direction: "desc", field: "name" },
      viewMode: "table",
    });
    expect(byP13nId.get("webhook-deliveries-card-store")).toMatchObject({
      pagination: { pageSize: 25 },
      sortDescriptor: { direction: "desc", field: "createdAt" },
      viewMode: null,
    });

    for (const type of ["contact", "organization", "deal", "service", "task"] as const) {
      const entry = byP13nId.get(`record-detail:${id(type)}`);
      const options = EntityDetailOptionsSchema.parse(entry?.detailOptions);
      expect(entry).toMatchObject({ hiddenColumns: [], viewMode: null });
      expect(options.collapsedSectionIds).toEqual([]);
      expect(options.fieldOrder?.slice(-3)).toEqual(["system:assignedTo", "system:createdAt", "system:updatedAt"]);
      expect(new Set(options.fieldOrder).size).toBe(options.fieldOrder?.length);
      expect(options.hiddenFieldIds).toEqual(expect.arrayContaining(["system:createdAt", "system:updatedAt"]));
      expect(options.hiddenFieldIds).not.toContain("system:assignedTo");
      expect(options.fieldOrder).toEqual(expect.arrayContaining(z.array(z.string()).parse(entry?.columnOrder)));
      for (const field of [...options.starredFieldIds, ...(options.hiddenFieldIds ?? [])])
        expect(options.fieldOrder).toContain(field);
    }
    expect(byP13nId.get(`record-detail:${id("deal")}`)).toMatchObject({
      columnOrder: [C.dealStatus, C.dealProjectPeriod],
      detailOptions: {
        starredFieldIds: [
          id("deal.totalValue"),
          dealStage,
          f.deal.openedOn,
          relationship("deal.organizations", "outgoing"),
          "system:assignedTo",
        ],
        hiddenFieldIds: [
          id("deal.weightedValue"),
          relationship("deal.contacts", "outgoing"),
          relationship("task.deals", "incoming"),
          "system:createdAt",
          "system:updatedAt",
        ],
      },
    });
    expect(byP13nId.get(`record-detail:${id("task")}`)?.columnOrder).toEqual([C.taskPriority, C.taskStatus]);
  });

  it("curates every list's All view and record page for an overview", () => {
    const fixtures = buildSyntheticP13nFixtures({ ids: SEED_IDS }, customFields);
    const byP13nId = new Map(fixtures.map((fixture) => [fixture.p13nId, fixture]));

    for (const type of LISTS) {
      const list = byP13nId.get(surface(type));
      const visible = z.array(z.string()).parse(list?.columnOrder);
      const hidden = z.array(z.string()).parse(list?.hiddenColumns);
      // A card shows three to five chips; a table the name plus four to six columns (three for the smallest lists).
      expect(visible.length, type).toBeGreaterThanOrEqual(3);
      expect(visible.length, type).toBeLessThanOrEqual(list?.viewMode === "card" ? 5 : 6);
      expect(
        visible.filter((column) => hidden.includes(column)),
        type,
      ).toEqual([]);
      expect(new Set([...visible, ...hidden]), type).toEqual(new Set(columns.all(type)));
      if (list?.groupingColumnId) expect(hidden, type).toContain(list.groupingColumnId);
      expect(GroupingSchema.safeParse(list?.grouping).data?.summaries?.length ?? 0, type).toBeLessThanOrEqual(2);

      const pins = EntityDetailOptionsSchema.parse(byP13nId.get(`record-detail:${id(type)}`)?.detailOptions);
      expect(pins.starredFieldIds.length, type).toBeGreaterThanOrEqual(3);
      expect(pins.starredFieldIds.length, type).toBeLessThanOrEqual(5);
      expect(new Set(pins.starredFieldIds).size, type).toBe(pins.starredFieldIds.length);
      for (const field of pins.starredFieldIds)
        expect([...columns.all(type), id(`${type}.name`)], type).toContain(field);
    }
  });

  it("upserts by the tenant-user-view key and removes only stale deterministic rows", async () => {
    const fixtures = buildSyntheticP13nFixtures({ ids: SEED_IDS }, customFields);
    const rows = new Map<
      string,
      SyntheticP13nFixture | { id: string; companyId: string; userId: string; p13nId: string }
    >([
      [
        "unrelated-p13n-row",
        {
          id: "unrelated-p13n-row",
          companyId: SEED_IDS.company,
          userId: SEED_IDS.user,
          p13nId: "unrelated-card-store",
        },
      ],
      [
        fixtureId(SYNTHETIC_P13N_ID_PREFIX, 999),
        {
          id: fixtureId(SYNTHETIC_P13N_ID_PREFIX, 999),
          companyId: SEED_IDS.company,
          userId: SEED_IDS.user,
          p13nId: "stale-card-store",
        },
      ],
    ]);
    const prisma = {
      p13n: {
        upsert: vi.fn(
          (input: {
            create: SyntheticP13nFixture;
            update: Omit<SyntheticP13nFixture, "id">;
            where: {
              companyId_userId_p13nId: {
                companyId: string;
                userId: string;
                p13nId: string;
              };
            };
          }) => {
            const key = input.where.companyId_userId_p13nId;
            const existing = [...rows.values()].find(
              (row) => row.companyId === key.companyId && row.userId === key.userId && row.p13nId === key.p13nId,
            );
            const row = existing ? { ...existing, ...input.update } : input.create;
            rows.set(row.id, row);
            return Promise.resolve(row);
          },
        ),
        deleteMany: vi.fn(
          (input: {
            where: {
              companyId: string;
              userId: string;
              id: { startsWith: string; notIn: string[] };
            };
          }) => {
            const keep = new Set(input.where.id.notIn);
            let count = 0;
            for (const [id, row] of rows) {
              if (
                row.companyId !== input.where.companyId ||
                row.userId !== input.where.userId ||
                !id.startsWith(input.where.id.startsWith) ||
                keep.has(id)
              )
                continue;
              rows.delete(id);
              count += 1;
            }
            return Promise.resolve({ count });
          },
        ),
      },
    } as unknown as Pick<PrismaClient, "p13n">;

    await persistSyntheticP13nFixtures(prisma, SEED_IDS.company, SEED_IDS.user, fixtures);
    await persistSyntheticP13nFixtures(prisma, SEED_IDS.company, SEED_IDS.user, fixtures);

    expect(rows).toHaveLength(31);
    expect(rows.has("unrelated-p13n-row")).toBe(true);
    expect(rows.has(fixtureId(SYNTHETIC_P13N_ID_PREFIX, 999))).toBe(false);

    await persistSyntheticP13nFixtures(prisma, SEED_IDS.company, SEED_IDS.user, fixtures.slice(0, -1));
    expect(rows).toHaveLength(30);
    expect(rows.has(fixtures.at(-1)?.id ?? "")).toBe(false);
    expect(rows.has("unrelated-p13n-row")).toBe(true);
  });
});
