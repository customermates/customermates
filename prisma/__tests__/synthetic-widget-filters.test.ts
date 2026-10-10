import { seedOrganizations } from "../seeds/organizations";
import { seedContacts } from "../seeds/contacts";
import { seedServices } from "../seeds/services";
import { seedDeals } from "../seeds/deals";
import { seedTasks } from "../seeds/tasks";
import { seedCustomFields } from "../seeds/custom-fields";
import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { WidgetKind } from "@/generated/prisma";

import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";

import { SEED_IDS, type SeedContext } from "../seeds/context";
import { SYNTHETIC_CUSTOM_FIELD_IDS, SYNTHETIC_CUSTOM_OPTION_IDS } from "../seeds/custom-fields";
import { seedWidgets, SYNTHETIC_WIDGET_NAMES } from "../seeds/widgets";

type SeedLayoutItem = { h: number; i: string; w: number; x: number; y: number };

describe("synthetic widget filters", () => {
  it("restores the canonical seven-widget dashboard with deterministic IDs and layouts", async () => {
    const calls: Array<{
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }> = [];
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

    const organizations = await seedOrganizations(context);
    const contacts = await seedContacts(context, organizations.organizations);
    const services = await seedServices(context);
    const deals = await seedDeals(context, services);
    const tasks = await seedTasks(context);
    const fields = seedCustomFields(context, { ...organizations, ...contacts, ...services, ...deals, ...tasks });
    await seedWidgets(context, fields);

    const widgets = calls.map(({ create }) => create);
    const widgetIds = widgets.map(({ id }) => id);
    expect(widgets).toHaveLength(7);
    expect(widgets.map(({ name }) => name)).toEqual(SYNTHETIC_WIDGET_NAMES);
    expect(widgetIds).toEqual([
      "15000000-0000-4000-8000-000000000002",
      "15000000-0000-4000-8000-000000000003",
      "15000000-0000-4000-8000-000000000004",
      "15000000-0000-4000-8000-000000000005",
      "15000000-0000-4000-8000-000000000007",
      "15000000-0000-4000-8000-000000000008",
      "15000000-0000-4000-8000-000000000009",
    ]);
    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(calls.every(({ create, update }) => JSON.stringify(create) === JSON.stringify(update))).toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        companyId: SEED_IDS.company,
        id: { startsWith: "15000000-", notIn: widgetIds },
      },
    });
    for (const widget of widgets) {
      expect(widget).not.toHaveProperty("entityFilters");
      expect(widget).not.toHaveProperty("dealFilters");
      expect(widget).not.toHaveProperty("timelineFilters");
      if (widget.kind === "chart") expect(widget.measure).toBeTruthy();
      else expect(widget.activityQuery).toBeTruthy();
    }
    expect(
      widgets.slice(2, 4).map(({ measure }) => (measure as { source: { filters: unknown[] } }).source.filters),
    ).toEqual([
      [
        {
          fieldId: SYNTHETIC_CUSTOM_FIELD_IDS.dealStatus,
          operator: "notIn",
          value: null,
          values: [{ kind: "select", value: SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.abandoned }],
        },
      ],
      [
        {
          fieldId: SYNTHETIC_CUSTOM_FIELD_IDS.dealStatus,
          operator: "notIn",
          value: null,
          values: [{ kind: "select", value: SYNTHETIC_CUSTOM_OPTION_IDS.dealStatus.abandoned }],
        },
      ],
    ]);
    expect(widgets.slice(4).map(({ activityQuery }) => (activityQuery as { filters: unknown[] }).filters)).toEqual([
      [{ kind: "source", operator: "in", values: ["audit"] }],
      [{ kind: "source", operator: "in", values: ["message"] }],
      [{ kind: "source", operator: "in", values: ["activity", "calendar_event"] }],
    ]);
    expect(widgets.map(({ kind }) => kind)).toEqual([
      WidgetKind.chart,
      WidgetKind.chart,
      WidgetKind.chart,
      WidgetKind.chart,
      WidgetKind.activityTimeline,
      WidgetKind.activityTimeline,
      WidgetKind.activityTimeline,
    ]);
    expect(widgets.map(({ id, layout }) => ({ id, layout }))).toEqual([
      {
        id: "15000000-0000-4000-8000-000000000002",
        layout: {
          lg: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000002",
            w: 3,
            x: 0,
            y: 0,
          },
          md: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000002",
            w: 2,
            x: 0,
            y: 0,
          },
          sm: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000002",
            w: 2,
            x: 0,
            y: 0,
          },
          xs: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000002",
            w: 1,
            x: 0,
            y: 0,
          },
        },
      },
      {
        id: "15000000-0000-4000-8000-000000000003",
        layout: {
          lg: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000003",
            w: 3,
            x: 3,
            y: 0,
          },
          md: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000003",
            w: 2,
            x: 2,
            y: 0,
          },
          sm: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000003",
            w: 2,
            x: 2,
            y: 0,
          },
          xs: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000003",
            w: 1,
            x: 1,
            y: 0,
          },
        },
      },
      {
        id: "15000000-0000-4000-8000-000000000004",
        layout: {
          lg: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000004",
            w: 3,
            x: 9,
            y: 0,
          },
          md: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000004",
            w: 2,
            x: 6,
            y: 0,
          },
          sm: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000004",
            w: 2,
            x: 2,
            y: 2,
          },
          xs: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000004",
            w: 1,
            x: 1,
            y: 2,
          },
        },
      },
      {
        id: "15000000-0000-4000-8000-000000000005",
        layout: {
          lg: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000005",
            w: 3,
            x: 6,
            y: 0,
          },
          md: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000005",
            w: 2,
            x: 4,
            y: 0,
          },
          sm: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000005",
            w: 2,
            x: 0,
            y: 2,
          },
          xs: {
            h: 2,
            i: "15000000-0000-4000-8000-000000000005",
            w: 1,
            x: 0,
            y: 2,
          },
        },
      },
      {
        id: "15000000-0000-4000-8000-000000000007",
        layout: {
          lg: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000007",
            w: 4,
            x: 0,
            y: 2,
          },
          md: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000007",
            w: 4,
            x: 0,
            y: 2,
          },
          sm: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000007",
            w: 4,
            x: 0,
            y: 7,
          },
          xs: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000007",
            w: 2,
            x: 0,
            y: 4,
          },
        },
      },
      {
        id: "15000000-0000-4000-8000-000000000008",
        layout: {
          lg: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000008",
            w: 4,
            x: 4,
            y: 2,
          },
          md: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000008",
            w: 4,
            x: 4,
            y: 2,
          },
          sm: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000008",
            w: 4,
            x: 0,
            y: 4,
          },
          xs: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000008",
            w: 2,
            x: 0,
            y: 7,
          },
        },
      },
      {
        id: "15000000-0000-4000-8000-000000000009",
        layout: {
          lg: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000009",
            w: 4,
            x: 8,
            y: 2,
          },
          md: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000009",
            w: 8,
            x: 0,
            y: 5,
          },
          sm: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000009",
            w: 4,
            x: 0,
            y: 10,
          },
          xs: {
            h: 3,
            i: "15000000-0000-4000-8000-000000000009",
            w: 2,
            x: 0,
            y: 10,
          },
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
