import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const { widgetFindMany, widgetFindFirst, widgetUpsert, calculateWidgetData } = vi.hoisted(() => ({
  widgetFindMany: vi.fn(),
  widgetFindFirst: vi.fn(),
  widgetUpsert: vi.fn(),
  calculateWidgetData: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getWidgetCalculatorRepo: () => ({ calculateWidgetData }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => ({
  ...MOCK_PRISMA_DB_MODULE,
  prisma: {
    ...MOCK_PRISMA_DB_MODULE.prisma,
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) =>
      fn({
        $executeRaw: vi.fn().mockResolvedValue(undefined),
        auditLog: { createMany: vi.fn() },
        webhookDelivery: { createMany: vi.fn() },
        widget: {
          findMany: widgetFindMany,
          findFirst: widgetFindFirst,
          upsert: widgetUpsert,
        },
      }),
    ),
    widget: {
      findMany: widgetFindMany,
      findFirst: widgetFindFirst,
      upsert: widgetUpsert,
    },
  },
}));

import type { ActivityWidgetDto, ChartWidgetDto, WidgetDto } from "../widget.schema";

import { PrismaWidgetRepo } from "../prisma-widget.repository";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { AggregationType, EntityType, WidgetGroupByType, WidgetKind } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";

const WIDGET_ID = "00000000-0000-4000-8000-000000000001";

function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WIDGET_ID,
    userId: mockUser.id,
    companyId: mockUser.companyId,
    name: "Legacy",
    kind: WidgetKind.chart,
    entityType: EntityType.deal,
    entityFilters: null,
    dealFilters: null,
    displayOptions: null,
    groupByType: WidgetGroupByType.none,
    groupByCustomColumnId: null,
    aggregationType: AggregationType.count,
    timelineFilters: null,
    layout: null,
    isTemplate: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function activityRow(overrides: Record<string, unknown> = {}) {
  return legacyRow({
    name: "Recent activity",
    kind: WidgetKind.activityTimeline,
    entityType: null,
    groupByType: null,
    aggregationType: null,
    timelineFilters: null,
    ...overrides,
  });
}

function asChart(widget: WidgetDto | null | undefined): ChartWidgetDto {
  if (!widget || widget.kind !== WidgetKind.chart) throw new Error("expected a chart widget");

  return widget;
}

function asActivity(widget: WidgetDto | null | undefined): ActivityWidgetDto {
  if (!widget || widget.kind !== WidgetKind.activityTimeline) throw new Error("expected an activity widget");

  return widget;
}

describe("PrismaWidgetRepo.toDto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calculateWidgetData.mockResolvedValue([{ labelKind: "system", systemLabelKey: "total", value: 3 }]);
  });

  it("normalizes null filter columns to empty arrays so the DTO gate cannot throw", async () => {
    widgetFindMany.mockResolvedValue([legacyRow()]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(asChart(widgets[0]).entityFilters).toEqual([]);
    expect(asChart(widgets[0]).dealFilters).toEqual([]);
  });

  it("leaves null configuration columns null rather than inventing a default", async () => {
    widgetFindMany.mockResolvedValue([legacyRow()]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(asChart(widgets[0]).displayOptions).toBeNull();
    expect(asChart(widgets[0]).layout).toBeNull();
  });

  it("hands the calculator normalized filters and no calculated data", async () => {
    widgetFindMany.mockResolvedValue([legacyRow()]);

    await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    const input = calculateWidgetData.mock.calls[0][0];

    expect(input).not.toHaveProperty("data");
    expect(input.entityFilters).toEqual([]);
    expect(input.dealFilters).toEqual([]);
  });

  it("preserves legacy value-taking relation filter behavior", async () => {
    widgetFindMany.mockResolvedValue([
      legacyRow({
        entityFilters: [
          {
            field: FilterFieldKey.userIds,
            operator: FilterOperatorKey.hasNone,
            value: ["u1"],
          },
          {
            field: FilterFieldKey.contactIds,
            operator: FilterOperatorKey.hasSome,
            value: ["c1"],
          },
        ],
      }),
    ]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());
    const normalized = [
      {
        field: FilterFieldKey.userIds,
        operator: FilterOperatorKey.notIn,
        value: ["u1"],
      },
      {
        field: FilterFieldKey.contactIds,
        operator: FilterOperatorKey.in,
        value: ["c1"],
      },
    ];

    expect(calculateWidgetData.mock.calls[0][0].entityFilters).toEqual(normalized);
    expect(asChart(widgets[0]).entityFilters).toEqual(normalized);
  });

  it("attaches calculated data to the completed DTO", async () => {
    widgetFindMany.mockResolvedValue([legacyRow()]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(asChart(widgets[0]).data).toEqual([{ labelKind: "system", systemLabelKey: "total", value: 3 }]);
  });

  it("reads through the explicit select, scoped to the tenant", async () => {
    widgetFindMany.mockResolvedValue([]);

    await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(widgetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: mockUser.id, companyId: mockUser.companyId },
      }),
    );
    expect(widgetFindMany.mock.calls[0][0].select).toHaveProperty("entityFilters", true);
  });

  it("scopes a single widget read to owned widgets or company templates", async () => {
    widgetFindFirst.mockResolvedValue(null);

    await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgetById(WIDGET_ID));

    expect(widgetFindFirst.mock.calls[0][0].where).toEqual({
      id: WIDGET_ID,
      companyId: mockUser.companyId,
      OR: [{ userId: mockUser.id }, { isTemplate: true }],
    });
  });

  it("persists absent filters as empty arrays rather than JSON null", async () => {
    widgetUpsert.mockResolvedValue(legacyRow());

    await runWithTenant(mockUser, () =>
      new PrismaWidgetRepo().upsertWidget({
        data: {
          kind: WidgetKind.chart,
          name: "New",
          entityType: EntityType.contact,
          groupByType: WidgetGroupByType.none,
          aggregationType: AggregationType.count,
          isTemplate: false,
        },
      }),
    );

    const created = widgetUpsert.mock.calls[0][0].create;

    expect(created.entityFilters).toEqual([]);
    expect(created.dealFilters).toEqual([]);
  });

  it("returns null for a missing widget without calling the calculator", async () => {
    widgetFindFirst.mockResolvedValue(null);

    const widget = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgetById(WIDGET_ID));

    expect(widget).toBeNull();
    expect(calculateWidgetData).not.toHaveBeenCalled();
  });

  it("normalizes a single widget read the same way as a list read", async () => {
    widgetFindFirst.mockResolvedValue(legacyRow());

    const widget = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgetById(WIDGET_ID));

    expect(asChart(widget).entityFilters).toEqual([]);
    expect(asChart(widget).displayOptions).toBeNull();
    expect(asChart(widget).data).toEqual([{ labelKind: "system", systemLabelKey: "total", value: 3 }]);
  });

  it("never sends an activity widget through the chart calculator", async () => {
    widgetFindMany.mockResolvedValue([activityRow()]);

    await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(calculateWidgetData).not.toHaveBeenCalled();
  });

  it("gives an activity widget no calculated data to render as a chart", async () => {
    widgetFindMany.mockResolvedValue([activityRow()]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(widgets[0]).not.toHaveProperty("data");
    expect(widgets[0]).not.toHaveProperty("entityType");
    expect(widgets[0]).not.toHaveProperty("aggregationType");
  });

  it("normalizes absent activity filters", async () => {
    widgetFindMany.mockResolvedValue([activityRow()]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(asActivity(widgets[0]).timelineFilters).toEqual([]);
  });

  it("normalizes legacy value-taking activity relationship filters before the strict DTO gate", async () => {
    const contactId = "16000000-0000-4000-8000-000000000001";
    const dealId = "16000000-0000-4000-8000-000000000002";
    widgetFindMany.mockResolvedValue([
      activityRow({
        timelineFilters: [
          {
            field: FilterFieldKey.contactIds,
            operator: FilterOperatorKey.hasSome,
            value: [contactId],
          },
          {
            field: FilterFieldKey.dealIds,
            operator: FilterOperatorKey.hasNone,
            value: [dealId],
          },
        ],
      }),
    ]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(asActivity(widgets[0]).timelineFilters).toEqual([
      {
        field: FilterFieldKey.contactIds,
        operator: FilterOperatorKey.in,
        value: [contactId],
      },
      {
        field: FilterFieldKey.dealIds,
        operator: FilterOperatorKey.notIn,
        value: [dealId],
      },
    ]);
  });

  it("drops an activity widget with malformed persisted filters instead of widening it", async () => {
    widgetFindMany.mockResolvedValue([
      activityRow({
        timelineFilters: [
          {
            field: FilterFieldKey.contactIds,
            operator: FilterOperatorKey.in,
            value: ["invalid"],
          },
        ],
      }),
    ]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(widgets).toEqual([]);
  });

  it("drops a non-array persisted activity filter payload without throwing or widening it", async () => {
    widgetFindMany.mockResolvedValue([
      activityRow({
        timelineFilters: "malformed" as never,
      }),
    ]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(widgets).toEqual([]);
  });

  it("drops an activity widget with duplicate persisted filter fields instead of choosing one", async () => {
    widgetFindMany.mockResolvedValue([
      activityRow({
        timelineFilters: [
          {
            field: FilterFieldKey.contactIds,
            operator: FilterOperatorKey.hasSome,
          },
          {
            field: FilterFieldKey.contactIds,
            operator: FilterOperatorKey.hasNone,
          },
        ],
      }),
    ]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(widgets).toEqual([]);
    expect(calculateWidgetData).not.toHaveBeenCalled();
  });

  it("calculates only the chart widgets in a mixed dashboard", async () => {
    widgetFindMany.mockResolvedValue([activityRow({ id: "00000000-0000-4000-8000-000000000002" }), legacyRow()]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(calculateWidgetData).toHaveBeenCalledTimes(1);
    expect(calculateWidgetData.mock.calls[0][0].entityType).toBe(EntityType.deal);
    expect(widgets.map((widget) => widget.kind)).toEqual([WidgetKind.activityTimeline, WidgetKind.chart]);
  });

  it("writes null chart columns for an activity widget so no rollback can read it as a chart", async () => {
    widgetUpsert.mockResolvedValue(activityRow());

    await runWithTenant(mockUser, () =>
      new PrismaWidgetRepo().upsertWidget({
        data: {
          kind: WidgetKind.activityTimeline,
          name: "Recent activity",
          timelineFilters: [
            {
              field: FilterFieldKey.dealIds,
              operator: FilterOperatorKey.hasSome,
            },
          ],
          isTemplate: false,
        },
      }),
    );

    const created = widgetUpsert.mock.calls[0][0].create;

    expect(created.entityType).toBeNull();
    expect(created.groupByType).toBeNull();
    expect(created.aggregationType).toBeNull();
    expect(created.groupByCustomColumnId).toBeNull();
    expect(created).not.toHaveProperty("entityFilters");
    expect(created).not.toHaveProperty("dealFilters");
    expect(created.timelineFilters).toEqual([
      {
        field: FilterFieldKey.dealIds,
        operator: FilterOperatorKey.hasSome,
      },
    ]);
  });

  it("writes JSON null to inactive timeline columns on chart widgets", async () => {
    widgetUpsert.mockResolvedValue(legacyRow());

    await runWithTenant(mockUser, () =>
      new PrismaWidgetRepo().upsertWidget({
        data: {
          kind: WidgetKind.chart,
          name: "New",
          entityType: EntityType.contact,
          groupByType: WidgetGroupByType.none,
          aggregationType: AggregationType.count,
          isTemplate: false,
        },
      }),
    );

    const created = widgetUpsert.mock.calls[0][0].create;

    expect(created).not.toHaveProperty("timelineFilters");
  });

  it("persists an explicit empty activity filter array when clearing filters", async () => {
    widgetUpsert.mockResolvedValue(activityRow());

    await runWithTenant(mockUser, () =>
      new PrismaWidgetRepo().upsertWidget({
        data: {
          id: WIDGET_ID,
          kind: WidgetKind.activityTimeline,
          name: "Recent activity",
          timelineFilters: [],
          isTemplate: false,
        },
      }),
    );

    expect(widgetUpsert.mock.calls[0][0].update.timelineFilters).toEqual([]);
  });

  it("keeps the tenant guard on both halves of the upsert", async () => {
    widgetUpsert.mockResolvedValue(activityRow());

    await runWithTenant(mockUser, () =>
      new PrismaWidgetRepo().upsertWidget({
        data: {
          kind: WidgetKind.activityTimeline,
          name: "Recent activity",
          isTemplate: false,
        },
      }),
    );

    const call = widgetUpsert.mock.calls[0][0];

    expect(call.create.companyId).toBe(mockUser.companyId);
    expect(call.update.companyId).toBe(mockUser.companyId);
    expect(call.where).toEqual({
      id: "",
      companyId: mockUser.companyId,
      userId: mockUser.id,
    });
    expect(call.create.timelineFilters).toEqual([]);
    expect(call.update).not.toHaveProperty("timelineFilters");
  });
});
