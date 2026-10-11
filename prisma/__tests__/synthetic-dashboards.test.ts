import type { PrismaClient } from "@/generated/prisma";

import { describe, expect, it, vi } from "vitest";

import { SYNTHETIC_SEED_USER } from "@/core/config/synthetic-seed-user";
import { SURFACE } from "@/core/data-view/data-view-keys";
import { RecordActivityQuerySchema } from "@/ee/messaging/activities/record-activities.schema";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { DisplayType, WidgetDisplayOptionsSchema } from "@/features/widget/widget-display.schema";
import { widgetDisplayRequirement } from "@/features/widget/widget-display-rules";
import { rectsOverlap, widgetMinimumSize } from "@/features/widget/widget-grid";
import { WidgetKind } from "@/generated/prisma";

import { SEED_IDS, type SeedContext } from "../seeds/context";
import {
  SYNTHETIC_CUSTOM_FIELD_IDS,
  SYNTHETIC_CUSTOM_OPTION_IDS,
  type CustomFieldSeedData,
} from "../seeds/custom-fields";
import { buildSyntheticDashboards, SYNTHETIC_DEFAULT_DASHBOARD, SYNTHETIC_WIDGET_ID_PREFIX } from "../seeds/dashboards";
import { SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX, SYNTHETIC_DASHBOARD_VIEW_IDS } from "../seeds/data-view-ids";
import { northwindModelIds } from "../seeds/northwind-model";
import {
  buildSyntheticDashboardViewFixtures,
  buildSyntheticWidgetFixtures,
  seedWidgets,
  SYNTHETIC_WIDGET_NAMES,
} from "../seeds/widgets";

const customFields: CustomFieldSeedData = {
  customFields: [],
  customFieldValues: [],
  customFieldIds: SYNTHETIC_CUSTOM_FIELD_IDS,
  customOptionIds: SYNTHETIC_CUSTOM_OPTION_IDS,
};
const dashboards = buildSyntheticDashboards(SEED_IDS.company, customFields);
const widgets = buildSyntheticWidgetFixtures({ ids: SEED_IDS }, dashboards);
const charts = dashboards.flatMap(({ widgets: items }) =>
  items.flatMap((item) => (item.kind === "chart" ? [item] : [])),
);
const model = northwindModelIds(SEED_IDS.company);
const SINGLE_CHOICE_FIELDS = new Set([
  model.fields.deal.stage,
  model.fields.ticket.status,
  model.fields.candidate.stage,
]);

describe("synthetic dashboards", () => {
  it("seeds six named dashboard views and lands on Sales", () => {
    expect(dashboards.map(({ name }) => name)).toEqual([
      "Sales",
      "Revenue and renewals",
      "Support",
      "Marketing",
      "Team activity",
      "Hiring",
    ]);
    expect(dashboards.map(({ viewId }) => viewId)).toEqual(Object.values(SYNTHETIC_DASHBOARD_VIEW_IDS));
    expect(SYNTHETIC_DEFAULT_DASHBOARD).toBe("sales");

    const views = buildSyntheticDashboardViewFixtures({ ids: SEED_IDS }, dashboards);
    expect(views.map(({ position }) => position)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(views.every(({ surfaceKey, userId }) => surfaceKey === SURFACE.dashboard && userId === SEED_IDS.user)).toBe(
      true,
    );
    expect(views.every(({ id }) => id.startsWith(`${SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX}-`))).toBe(true);
  });

  it("stores valid widgets with unique deterministic ids on their dashboard", () => {
    expect(widgets.map(({ name }) => name)).toEqual(SYNTHETIC_WIDGET_NAMES);
    expect(new Set(widgets.map(({ id }) => id)).size).toBe(widgets.length);
    expect(widgets.every(({ id }) => id.startsWith(`${SYNTHETIC_WIDGET_ID_PREFIX}-`))).toBe(true);
    expect(new Set(widgets.map(({ viewId }) => viewId))).toEqual(new Set(Object.values(SYNTHETIC_DASHBOARD_VIEW_IDS)));

    for (const widget of widgets) {
      if (widget.kind === WidgetKind.chart) {
        expect(RecordMeasureSchema.safeParse(widget.measure).success, widget.name).toBe(true);
        expect(WidgetDisplayOptionsSchema.safeParse(widget.displayOptions).success, widget.name).toBe(true);
      } else expect(RecordActivityQuerySchema.safeParse(widget.activityQuery).success, widget.name).toBe(true);
    }
  });

  it("uses every display type and meets each one's grouping requirement", () => {
    expect(new Set(charts.map(({ displayType }) => displayType))).toEqual(new Set(Object.values(DisplayType)));

    for (const { name, displayType, measure } of charts) {
      const requirement = widgetDisplayRequirement(displayType);
      if (requirement === "noGrouping") expect(measure.groupBy, name).toBeNull();
      if (requirement === "grouping") expect(measure.groupBy, name).not.toBeNull();
      if (requirement === "timeInterval") expect(measure.groupBy?.dateInterval, name).toBeDefined();
      if (requirement === "singleChoice") {
        expect(measure.groupBy?.dateInterval, name).toBeUndefined();
        expect(SINGLE_CHOICE_FIELDS.has(measure.groupBy?.fieldId ?? ""), name).toBe(true);
      }
    }
  });

  it("covers aggregations, date intervals, member, relationship and filtered groupings", () => {
    const measures = charts.map(({ measure }) => measure);

    expect(new Set(measures.map(({ aggregation }) => aggregation))).toEqual(
      new Set(["count", "sum", "average", "min", "max"]),
    );
    expect(new Set(measures.flatMap(({ groupBy }) => groupBy?.dateInterval ?? []))).toEqual(
      new Set(["day", "week", "month", "quarter"]),
    );
    expect(measures.some(({ groupBy }) => groupBy?.fieldId === "system:assignedTo")).toBe(true);
    expect(measures.some(({ groupBy }) => groupBy?.fieldId === model.fields.ticket.assignee)).toBe(true);
    expect(measures.some(({ groupBy }) => groupBy && groupBy.path.length > 0 && groupBy.fieldId)).toBe(true);
    expect(measures.some(({ groupBy }) => groupBy && groupBy.path.length > 1 && !groupBy.fieldId)).toBe(true);
    expect(measures.some(({ groupBy }) => groupBy?.filter?.filters?.length)).toBe(true);
    expect(measures.some(({ source }) => source.relationships.length > 0)).toBe(true);
    expect(new Set(measures.flatMap(({ source }) => source.filters.map(({ operator }) => operator)))).toEqual(
      new Set(["in", "notIn", "eq", "inLastDays", "notInLastDays", "notEmpty"]),
    );
    expect(widgets.filter(({ kind }) => kind === WidgetKind.activityTimeline)).toHaveLength(2);
  });

  it("lays every dashboard out on each breakpoint without overlaps", () => {
    const columns = { lg: 12, md: 8, sm: 4, xs: 2 } as const;
    for (const dashboard of Object.values(SYNTHETIC_DASHBOARD_VIEW_IDS)) {
      const items = widgets.filter(({ viewId }) => viewId === dashboard);
      for (const [breakpoint, count] of Object.entries(columns)) {
        const rects = items.map((item) => ({
          kind: item.kind,
          rect: (item.layout as Record<string, { i: string; x: number; y: number; w: number; h: number }>)[breakpoint],
        }));
        for (const { kind, rect } of rects) {
          const minimum = widgetMinimumSize(kind);
          expect(rect.x + rect.w, `${breakpoint} ${rect.i}`).toBeLessThanOrEqual(count);
          expect(rect.w).toBeGreaterThanOrEqual(Math.min(minimum.w, count));
          expect(rect.h).toBeGreaterThanOrEqual(minimum.h);
        }
        for (let left = 0; left < rects.length; left += 1) {
          for (let right = left + 1; right < rects.length; right += 1) {
            expect(rectsOverlap(rects[left].rect, rects[right].rect), `${breakpoint} ${rects[left].rect.i}`).toBe(
              false,
            );
          }
        }
      }
      const desktop = items.map((item) => (item.layout as Record<string, { y: number; h: number; w: number }>).lg);
      const rows = new Map<number, number>();
      for (const rect of desktop) rows.set(rect.y, (rows.get(rect.y) ?? 0) + rect.w);
      for (const [row, width] of rows) expect(width, `${dashboard} row ${row}`).toBe(12);
    }
  });

  it("writes the dashboard views before the widgets and removes only stale seeded rows", async () => {
    const order: string[] = [];
    const viewDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const widgetDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      dataView: {
        upsert: vi.fn(() => {
          order.push("view");
          return Promise.resolve({});
        }),
        deleteMany: viewDeleteMany,
      },
      widget: {
        upsert: vi.fn((input: { create: Record<string, unknown>; update: Record<string, unknown> }) => {
          order.push("widget");
          expect(JSON.stringify(input.create)).toBe(JSON.stringify(input.update));
          return Promise.resolve(input.create);
        }),
        deleteMany: widgetDeleteMany,
      },
    } as unknown as PrismaClient;
    const context = {
      prisma,
      ids: SEED_IDS,
      seedUserEmail: SYNTHETIC_SEED_USER.email,
      sharedUserPassword: "test-password",
    } satisfies SeedContext;

    await seedWidgets(context, customFields);

    expect(order.lastIndexOf("view")).toBeLessThan(order.indexOf("widget"));
    expect(order.filter((entry) => entry === "widget")).toHaveLength(widgets.length);
    expect(widgetDeleteMany).toHaveBeenCalledWith({
      where: {
        companyId: SEED_IDS.company,
        id: { startsWith: `${SYNTHETIC_WIDGET_ID_PREFIX}-`, notIn: widgets.map(({ id }) => id) },
      },
    });
    expect(viewDeleteMany).toHaveBeenCalledWith({
      where: {
        companyId: SEED_IDS.company,
        id: {
          startsWith: `${SYNTHETIC_DASHBOARD_VIEW_ID_PREFIX}-`,
          notIn: Object.values(SYNTHETIC_DASHBOARD_VIEW_IDS),
        },
      },
    });
  });
});
