import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { Prisma, WidgetKind } from "@/generated/prisma";

import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";

import { SEED_IDS, type SeedContext } from "../seeds/context";
import { SYNTHETIC_CUSTOM_COLUMN_IDS, SYNTHETIC_CUSTOM_OPTION_IDS } from "../seeds/custom-fields";
import { seedWidgets, SYNTHETIC_WIDGET_NAMES } from "../seeds/widgets";

type SeedLayoutItem = { h: number; i: string; w: number; x: number; y: number };

describe("synthetic widget filters", () => {
  it("restores the three legacy option filters with deterministic current IDs", async () => {
    const calls: Array<{ create: Record<string, unknown>; update: Record<string, unknown> }> = [];
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      widget: {
        deleteMany,
        upsert: vi.fn((input: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          calls.push(input);
          return Promise.resolve(input.create);
        }),
      },
    } as unknown as PrismaClient;
    const context = {
      prisma,
      ids: SEED_IDS,
      seedUserEmail: SYNTHETIC_SEED_USER.email,
      sharedUserPassword: "test-password",
    } satisfies SeedContext;

    await seedWidgets(context, {
      customColumnIds: SYNTHETIC_CUSTOM_COLUMN_IDS,
      customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
    });

    const widgets = calls.map(({ create }) => create);
    expect(widgets).toHaveLength(7);
    expect(widgets.map(({ name }) => name)).toEqual(SYNTHETIC_WIDGET_NAMES);
    expect(deleteMany).toHaveBeenCalledOnce();
    expect(calls.every(({ create, update }) => JSON.stringify(create) === JSON.stringify(update))).toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        companyId: SEED_IDS.company,
        id: {
          startsWith: "15000000-",
          notIn: widgets.map(({ id }) => id),
        },
      },
    });
    expect(widgets.map(({ entityFilters }) => entityFilters)).toEqual([
      [
        {
          field: SYNTHETIC_CUSTOM_COLUMN_IDS.serviceType,
          operator: "in",
          value: [SYNTHETIC_CUSTOM_OPTION_IDS.serviceType.hardware],
        },
      ],
      [],
      [],
      [
        {
          field: SYNTHETIC_CUSTOM_COLUMN_IDS.dealStatus,
          operator: "notIn",
          value: [SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.abandoned],
        },
      ],
      [
        {
          field: SYNTHETIC_CUSTOM_COLUMN_IDS.dealStatus,
          operator: "notIn",
          value: [SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.abandoned],
        },
      ],
      [],
      Prisma.DbNull,
    ]);
    expect(widgets.map(({ timelineFilters }) => timelineFilters).slice(0, -1)).toEqual(
      Array.from({ length: 6 }, () => Prisma.DbNull),
    );
    expect(widgets.map(({ kind }) => kind)).toEqual([
      ...Array.from({ length: 6 }, () => WidgetKind.chart),
      WidgetKind.activityTimeline,
    ]);
    expect(widgets.slice(-1).map(({ timelineFilters }) => timelineFilters)).toEqual([
      [{ field: "timelineKind", operator: "in", value: ["changes", "messages"] }],
    ]);
    expect(widgets.slice(-1).map(({ id, layout }) => ({ id, layout }))).toEqual([
      {
        id: "15000000-0000-4000-8000-000000000007",
        layout: {
          lg: { h: 3, i: "15000000-0000-4000-8000-000000000007", w: 4, x: 8, y: 2 },
          md: { h: 4, i: "15000000-0000-4000-8000-000000000007", w: 4, x: 4, y: 3 },
          sm: { h: 4, i: "15000000-0000-4000-8000-000000000007", w: 2, x: 2, y: 3 },
          xs: { h: 4, i: "15000000-0000-4000-8000-000000000007", w: 2, x: 0, y: 9 },
        },
      },
    ]);

    const columns = { lg: 12, md: 8, sm: 4, xs: 2 } as const;
    for (const [breakpoint, columnCount] of Object.entries(columns)) {
      const items = widgets.map(({ layout }) => (layout as Record<string, SeedLayoutItem>)[breakpoint]);
      for (const item of items) {
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.y).toBeGreaterThanOrEqual(0);
        expect(item.w).toBeGreaterThan(0);
        expect(item.h).toBeGreaterThan(0);
        expect(item.x + item.w).toBeLessThanOrEqual(columnCount);
      }

      for (let left = 0; left < items.length; left += 1) {
        for (let right = left + 1; right < items.length; right += 1) {
          const a = items[left];
          const b = items[right];
          const overlaps = a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
          expect(overlaps, `${breakpoint}: ${a.i} overlaps ${b.i}`).toBe(false);
        }
      }
    }
  });
});
