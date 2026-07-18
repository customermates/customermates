import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  FilterSchema,
  PaginationRequestSchema,
  SavedFilterPresetSchema,
  SortDescriptorSchema,
} from "@/core/base/base-get.schema";
import { ViewMode } from "@/core/base/base-query-builder";

import { SEED_IDS } from "../seeds/context";
import { SYNTHETIC_CUSTOM_COLUMN_IDS, SYNTHETIC_CUSTOM_OPTION_IDS } from "../seeds/custom-fields";
import { fixtureId } from "../seeds/helpers";
import {
  buildSyntheticP13nFixtures,
  persistSyntheticP13nFixtures,
  SYNTHETIC_P13N_IDS,
  SYNTHETIC_P13N_ID_PREFIX,
  SYNTHETIC_P13N_PRESET_IDS,
  type SyntheticP13nFixture,
} from "../seeds/personalization";

const customFields = {
  customColumnIds: SYNTHETIC_CUSTOM_COLUMN_IDS,
  customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
};

describe("synthetic personalization fixtures", () => {
  it("maps all ten legacy views to deterministic current column, option, and user IDs", () => {
    const fixtures = buildSyntheticP13nFixtures({ ids: SEED_IDS }, customFields);
    const byP13nId = new Map(fixtures.map((fixture) => [fixture.p13nId, fixture]));

    expect(fixtures).toHaveLength(10);
    expect(fixtures.map(({ p13nId }) => p13nId)).toEqual([
      "contacts-card-store",
      "users-card-store",
      "tasks-card-store",
      "roles-card-store",
      "webhooks-card-store",
      "deals-card-store",
      "services-card-store",
      "audit-logs-card-store",
      "webhook-deliveries-card-store",
      "organizations-card-store",
    ]);
    expect(new Set(fixtures.map(({ id }) => id))).toEqual(new Set(Object.values(SYNTHETIC_P13N_IDS)));
    expect(fixtures.every(({ companyId, userId }) => companyId === SEED_IDS.company && userId === SEED_IDS.user)).toBe(
      true,
    );
    for (const fixture of fixtures) {
      expect(z.array(FilterSchema).safeParse(fixture.filters).success).toBe(true);
      expect(z.array(SavedFilterPresetSchema).safeParse(fixture.savedFilterPresets).success).toBe(true);
      expect(SortDescriptorSchema.safeParse(fixture.sortDescriptor).success).toBe(true);
      expect(PaginationRequestSchema.safeParse(fixture.pagination).success).toBe(true);
      if (fixture.viewMode !== null) expect(z.enum(ViewMode).safeParse(fixture.viewMode).success).toBe(true);
      if (fixture.groupingColumnId !== null) expect(z.uuid().safeParse(fixture.groupingColumnId).success).toBe(true);
    }

    expect(byP13nId.get("contacts-card-store")).toMatchObject({
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
      pagination: { page: 1, pageSize: 100 },
      sortDescriptor: { direction: "asc", field: "name" },
      viewMode: "table",
    });
    expect(byP13nId.get("tasks-card-store")).toMatchObject({
      columnOrder: [
        SYNTHETIC_CUSTOM_COLUMN_IDS.taskPriority,
        SYNTHETIC_CUSTOM_COLUMN_IDS.taskStatus,
        "updatedAt",
        "createdAt",
        "users",
      ],
      filters: [{ field: "userIds", operator: "in", value: [SEED_IDS.user] }],
      groupingColumnId: SYNTHETIC_CUSTOM_COLUMN_IDS.taskStatus,
      hiddenColumns: [
        SYNTHETIC_CUSTOM_COLUMN_IDS.taskStatus,
        "createdAt",
        "contacts",
        "organizations",
        "deals",
        "services",
        "users",
        "updatedAt",
      ],
      viewMode: "card",
    });
    expect(byP13nId.get("deals-card-store")).toMatchObject({
      columnOrder: [
        SYNTHETIC_CUSTOM_COLUMN_IDS.dealStatus,
        "totalValue",
        "tasks",
        "totalQuantity",
        SYNTHETIC_CUSTOM_COLUMN_IDS.dealProjectPeriod,
        "contacts",
        "organizations",
        "services",
        "users",
        "updatedAt",
        "createdAt",
      ],
      groupingColumnId: SYNTHETIC_CUSTOM_COLUMN_IDS.dealStatus,
      hiddenColumns: ["contacts", "updatedAt", "createdAt", "tasks"],
      viewMode: "card",
    });
    expect(byP13nId.get("services-card-store")).toMatchObject({
      columnOrder: [
        SYNTHETIC_CUSTOM_COLUMN_IDS.serviceType,
        "amount",
        SYNTHETIC_CUSTOM_COLUMN_IDS.servicePricing,
        "deals",
        "tasks",
        "updatedAt",
        "createdAt",
        "users",
      ],
      hiddenColumns: ["createdAt", "tasks"],
      viewMode: "table",
    });

    const organizations = byP13nId.get("organizations-card-store");
    expect(organizations).toMatchObject({
      columnOrder: [
        "contacts",
        "deals",
        "tasks",
        SYNTHETIC_CUSTOM_COLUMN_IDS.organizationType,
        SYNTHETIC_CUSTOM_COLUMN_IDS.organizationWebsite,
        "updatedAt",
        "createdAt",
        "users",
      ],
      columnWidths: { deals: 227, tasks: 191 },
      hiddenColumns: ["createdAt"],
      viewMode: "table",
    });
    expect(organizations?.savedFilterPresets).toEqual([
      {
        filters: [
          {
            field: SYNTHETIC_CUSTOM_COLUMN_IDS.organizationType,
            operator: "in",
            value: [SYNTHETIC_CUSTOM_OPTION_IDS.organizationType.directCustomer],
          },
          { field: "userIds", operator: "in", value: [SEED_IDS.user] },
        ],
        id: SYNTHETIC_P13N_PRESET_IDS.directCustomer,
        name: "Direct customer",
      },
      {
        filters: [
          {
            field: SYNTHETIC_CUSTOM_COLUMN_IDS.organizationType,
            operator: "in",
            value: [SYNTHETIC_CUSTOM_OPTION_IDS.organizationType.affiliatedCompany],
          },
          { field: "userIds", operator: "in", value: [SEED_IDS.user] },
        ],
        id: SYNTHETIC_P13N_PRESET_IDS.affiliatedCompany,
        name: "Affiliated company",
      },
    ]);

    expect(byP13nId.get("users-card-store")).toMatchObject({
      columnWidths: { role: 108 },
      hiddenColumns: ["email"],
      pagination: { page: 1, pageSize: 100 },
      sortDescriptor: { direction: "desc", field: "name" },
      viewMode: "table",
    });
    expect(byP13nId.get("roles-card-store")).toMatchObject({
      pagination: { page: 1, pageSize: 100 },
      sortDescriptor: { direction: "asc", field: "type" },
      viewMode: null,
    });
    expect(byP13nId.get("webhooks-card-store")).toMatchObject({
      pagination: { page: 1, pageSize: 100 },
      sortDescriptor: { direction: "desc", field: "name" },
      viewMode: "card",
    });
    expect(byP13nId.get("audit-logs-card-store")).toMatchObject({
      columnOrder: ["event", "entityId", "createdAt", "user"],
      hiddenColumns: ["entityId"],
      pagination: { page: 1, pageSize: 25 },
      sortDescriptor: { direction: "desc", field: "createdAt" },
      viewMode: "table",
    });
    expect(byP13nId.get("webhook-deliveries-card-store")).toMatchObject({
      pagination: { page: 1, pageSize: 25 },
      sortDescriptor: { direction: "desc", field: "createdAt" },
      viewMode: null,
    });
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

    expect(rows).toHaveLength(11);
    expect(rows.has("unrelated-p13n-row")).toBe(true);
    expect(rows.has(fixtureId(SYNTHETIC_P13N_ID_PREFIX, 999))).toBe(false);

    await persistSyntheticP13nFixtures(prisma, SEED_IDS.company, SEED_IDS.user, fixtures.slice(0, -1));
    expect(rows).toHaveLength(10);
    expect(rows.has(fixtures.at(-1)?.id ?? "")).toBe(false);
    expect(rows.has("unrelated-p13n-row")).toBe(true);
  });
});
