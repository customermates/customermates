import { beforeEach, describe, expect, it, vi } from "vitest";
import { decode } from "@toon-format/toon";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({
  deleteWidget: vi.fn(),
  getWidgetById: vi.fn(),
  getWidgets: vi.fn(),
  upsertWidget: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getDeleteWidgetInteractor: () => ({ invoke: spies.deleteWidget }),
  getGetWidgetByIdInteractor: () => ({ invoke: spies.getWidgetById }),
  getGetWidgetsInteractor: () => ({ invoke: spies.getWidgets }),
  getUpsertWidgetInteractor: () => ({ invoke: spies.upsertWidget }),
}));

import { AggregationType, EntityType, WidgetGroupByType, WidgetKind } from "@/generated/prisma";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { ChartColor, DisplayType, type ActivityWidgetDto, type ChartWidgetDto } from "@/features/widget/widget.schema";

import { manageWidgetsTool } from "../widget.mcp-tools";
import { formatDatesInResponse } from "../utils";

const WIDGET_ID = "16000000-0000-4000-8000-000000000001";
const RECORD_ID = "16000000-0000-4000-8000-000000000002";
const relationshipFilter: ActivityWidgetDto["timelineFilters"][number] = {
  field: FilterFieldKey.contactIds,
  operator: FilterOperatorKey.in,
  value: [RECORD_ID],
};

function chartWidget(overrides: Partial<ChartWidgetDto> = {}): ChartWidgetDto {
  return {
    id: WIDGET_ID,
    userId: mockUser.id,
    companyId: mockUser.companyId,
    kind: WidgetKind.chart,
    name: "Deals",
    entityType: EntityType.deal,
    entityFilters: [],
    dealFilters: [],
    displayOptions: {
      displayType: DisplayType.verticalBarChart,
      reverseXAxis: false,
      reverseYAxis: false,
      barColors: [ChartColor.primary1],
    },
    groupByType: WidgetGroupByType.none,
    groupByCustomColumnId: null,
    aggregationType: AggregationType.count,
    data: [],
    layout: null,
    isTemplate: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function activityWidget(overrides: Partial<ActivityWidgetDto> = {}): ActivityWidgetDto {
  return {
    id: WIDGET_ID,
    userId: mockUser.id,
    companyId: mockUser.companyId,
    kind: WidgetKind.activityTimeline,
    name: "Recent activity",
    timelineFilters: [relationshipFilter],
    displayOptions: { showFilters: false },
    layout: null,
    isTemplate: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function run(args: Record<string, unknown>) {
  return manageWidgetsTool.execute(manageWidgetsTool.inputSchema.parse(args));
}

const chartCreate = {
  action: "create",
  name: "Deals",
  entityType: EntityType.deal,
  displayType: DisplayType.verticalBarChart,
  groupByType: WidgetGroupByType.none,
  aggregationType: AggregationType.count,
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("manage_widgets create", () => {
  it("keeps omitted kind backward-compatible with chart creation", async () => {
    spies.upsertWidget.mockResolvedValue({ ok: true, data: chartWidget() });

    const result = await run(chartCreate);

    expect(spies.upsertWidget).toHaveBeenCalledWith({
      kind: WidgetKind.chart,
      name: "Deals",
      entityType: EntityType.deal,
      groupByType: WidgetGroupByType.none,
      groupByCustomColumnId: undefined,
      aggregationType: AggregationType.count,
      entityFilters: [],
      dealFilters: [],
      displayOptions: {
        displayType: DisplayType.verticalBarChart,
        reverseXAxis: false,
        reverseYAxis: false,
        barColors: [ChartColor.primary1, ChartColor.primary2],
      },
      isTemplate: false,
    });
    expect(decode(result)).toEqual({
      id: WIDGET_ID,
      kind: WidgetKind.chart,
      name: "Deals",
      message: 'Widget "Deals" created successfully',
    });
  });

  it("creates an activity widget with filter defaults", async () => {
    spies.upsertWidget.mockResolvedValue({
      ok: true,
      data: activityWidget({ timelineFilters: [] }),
    });

    const result = await run({
      action: "create",
      kind: WidgetKind.activityTimeline,
      name: "Recent activity",
    });

    expect(spies.upsertWidget).toHaveBeenCalledWith({
      kind: WidgetKind.activityTimeline,
      name: "Recent activity",
      timelineFilters: [],
      displayOptions: { showFilters: true },
      isTemplate: false,
    });
    expect(decode(result)).toEqual({
      id: WIDGET_ID,
      kind: WidgetKind.activityTimeline,
      name: "Recent activity",
      message: 'Widget "Recent activity" created successfully',
    });
  });

  it("round-trips relationship filters and a false display flag", async () => {
    spies.upsertWidget.mockResolvedValue({ ok: true, data: activityWidget() });

    await run({
      action: "create",
      kind: WidgetKind.activityTimeline,
      name: "Recent activity",
      timelineFilters: [relationshipFilter],
      showFilters: false,
    });

    expect(spies.upsertWidget).toHaveBeenCalledWith(
      expect.objectContaining({
        timelineFilters: [relationshipFilter],
        displayOptions: { showFilters: false },
      }),
    );
  });

  it("rejects fields from the other widget kind", async () => {
    expect(await run({ ...chartCreate, timelineFilters: [relationshipFilter] })).toContain("Validation error:");
    expect(
      await run({
        action: "create",
        kind: WidgetKind.activityTimeline,
        name: "Recent activity",
        entityType: EntityType.contact,
      }),
    ).toContain("Validation error:");
    expect(spies.upsertWidget).not.toHaveBeenCalled();
  });

  it("enforces strict relationship membership and standalone shapes", () => {
    const base = {
      action: "create",
      kind: WidgetKind.activityTimeline,
      name: "Recent activity",
    };
    expect(
      manageWidgetsTool.inputSchema.safeParse({
        ...base,
        timelineFilters: [{ ...relationshipFilter, value: [] }],
      }).success,
    ).toBe(false);
    expect(
      manageWidgetsTool.inputSchema.safeParse({
        ...base,
        timelineFilters: [
          {
            field: FilterFieldKey.contactIds,
            operator: FilterOperatorKey.hasSome,
            value: [RECORD_ID],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      manageWidgetsTool.inputSchema.safeParse({
        ...base,
        timelineFilters: Array.from({ length: 51 }, () => relationshipFilter),
      }).success,
    ).toBe(false);
    expect(
      manageWidgetsTool.inputSchema.safeParse({
        ...base,
        timelineFilters: [relationshipFilter, relationshipFilter],
      }).success,
    ).toBe(false);
  });
});

describe("manage_widgets update", () => {
  it("updates a stored chart while preserving every omitted chart field", async () => {
    const stored = chartWidget({
      entityFilters: [{ field: "name", operator: FilterOperatorKey.contains, value: "old" }],
      dealFilters: [{ field: "status", operator: FilterOperatorKey.in, value: ["open"] }],
      displayOptions: {
        displayType: DisplayType.verticalBarChart,
        reverseXAxis: false,
        reverseYAxis: true,
        barColors: [ChartColor.primary1],
        showFilters: false,
        showLegend: false,
      },
    });
    spies.getWidgetById.mockResolvedValue({ ok: true, data: stored });
    spies.upsertWidget.mockResolvedValue({
      ok: true,
      data: chartWidget({
        name: "Renamed",
        aggregationType: AggregationType.dealValue,
      }),
    });

    const replacementFilters = [{ field: "name", operator: FilterOperatorKey.contains, value: "new" }];
    const result = await run({
      action: "update",
      id: WIDGET_ID,
      name: "Renamed",
      aggregationType: AggregationType.dealValue,
      displayType: DisplayType.horizontalBarChart,
      reverseXAxis: true,
      entityFilters: replacementFilters,
    });

    expect(spies.upsertWidget).toHaveBeenCalledWith({
      id: WIDGET_ID,
      kind: WidgetKind.chart,
      name: "Renamed",
      entityType: stored.entityType,
      groupByType: stored.groupByType,
      groupByCustomColumnId: undefined,
      aggregationType: AggregationType.dealValue,
      entityFilters: replacementFilters,
      dealFilters: stored.dealFilters,
      displayOptions: {
        ...stored.displayOptions,
        displayType: DisplayType.horizontalBarChart,
        reverseXAxis: true,
      },
      isTemplate: false,
    });
    expect(decode(result)).toMatchObject({
      kind: WidgetKind.chart,
      name: "Renamed",
    });
  });

  it("infers activity kind and preserves omitted filters without resubmitting them", async () => {
    spies.getWidgetById.mockResolvedValue({ ok: true, data: activityWidget() });
    spies.upsertWidget.mockResolvedValue({
      ok: true,
      data: activityWidget({ name: "Renamed" }),
    });

    const result = await run({
      action: "update",
      id: WIDGET_ID,
      name: "Renamed",
    });

    expect(spies.upsertWidget).toHaveBeenCalledWith({
      id: WIDGET_ID,
      kind: WidgetKind.activityTimeline,
      name: "Renamed",
      displayOptions: { showFilters: false },
      isTemplate: false,
    });
    expect(result).toContain(WidgetKind.activityTimeline);
  });

  it("clears filters with an explicit empty array and retains false", async () => {
    spies.getWidgetById.mockResolvedValue({ ok: true, data: activityWidget() });
    spies.upsertWidget.mockResolvedValue({
      ok: true,
      data: activityWidget({
        timelineFilters: [],
        displayOptions: { showFilters: false },
      }),
    });

    await run({
      action: "update",
      id: WIDGET_ID,
      timelineFilters: [],
      showFilters: false,
    });

    expect(spies.upsertWidget).toHaveBeenCalledWith(
      expect.objectContaining({
        timelineFilters: [],
        displayOptions: { showFilters: false },
      }),
    );
  });

  it("rejects kind and cross-kind fields without writing", async () => {
    spies.getWidgetById.mockResolvedValue({ ok: true, data: activityWidget() });

    expect(
      await run({
        action: "update",
        id: WIDGET_ID,
        kind: WidgetKind.activityTimeline,
      }),
    ).toContain("Validation error:");
    expect(
      await run({
        action: "update",
        id: WIDGET_ID,
        aggregationType: AggregationType.count,
      }),
    ).toContain("Validation error:");
    expect(spies.upsertWidget).not.toHaveBeenCalled();
  });

  it("rejects activity-only fields on a stored chart", async () => {
    spies.getWidgetById.mockResolvedValue({ ok: true, data: chartWidget() });

    expect(await run({ action: "update", id: WIDGET_ID, timelineFilters: [] })).toContain("Validation error:");
    expect(spies.upsertWidget).not.toHaveBeenCalled();
  });
});

describe("manage_widgets read and delete", () => {
  it("lists and gets mixed widget kinds with reusable activity filters", async () => {
    spies.getWidgets.mockResolvedValue({
      data: [chartWidget(), activityWidget({ id: RECORD_ID })],
    });
    const list = await run({ action: "list" });
    expect(decode(list)).toEqual({
      items: [
        { id: WIDGET_ID, name: "Deals", kind: WidgetKind.chart },
        {
          id: RECORD_ID,
          name: "Recent activity",
          kind: WidgetKind.activityTimeline,
        },
      ],
      total: 2,
    });

    spies.getWidgetById.mockResolvedValueOnce({ ok: true, data: chartWidget() }).mockResolvedValueOnce({
      ok: true,
      data: activityWidget({ id: RECORD_ID }),
    });
    const get = await run({ action: "get", ids: [WIDGET_ID, RECORD_ID] });
    expect(decode(get)).toEqual(formatDatesInResponse([chartWidget(), activityWidget({ id: RECORD_ID })]));
  });

  it("deletes either stored kind after existence is confirmed", async () => {
    spies.getWidgetById.mockResolvedValue({ ok: true, data: activityWidget() });
    spies.deleteWidget.mockResolvedValue({ ok: true, data: WIDGET_ID });

    expect(await run({ action: "delete", id: WIDGET_ID })).toBe(`Deleted widget ${WIDGET_ID}`);
    expect(spies.deleteWidget).toHaveBeenCalledWith({ id: WIDGET_ID });
  });
});
