import type { RecordActivityWidgetDto } from "@/features/widget/record-activity-widget.schema";
import { RecordActivityQuerySchema } from "@/ee/messaging/activities/record-activities.schema";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decode } from "@toon-format/toon";
import { createTranslator } from "next-intl";

import messages from "@/i18n/locales/en.json";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, MOCK_ZOD_MODULE, createMockDiModule } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const spies = vi.hoisted(() => ({
  deleteWidget: vi.fn(),
  getWidgetById: vi.fn(),
  getWidgets: vi.fn(),
  upsertWidget: vi.fn(),
  upsertRecordWidget: vi.fn(),
  upsertRecordActivityWidget: vi.fn(),
}));

vi.mock("next-intl/server", () => ({
  getTranslations: (namespace: "Common.errors") =>
    Promise.resolve(createTranslator({ locale: "en", messages, namespace })),
}));
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getDeleteWidgetInteractor: () => ({ invoke: spies.deleteWidget }),
  getGetWidgetByIdInteractor: () => ({ invoke: spies.getWidgetById }),
  getGetWidgetsInteractor: () => ({ invoke: spies.getWidgets }),
  getUpsertWidgetInteractor: () => ({ invoke: spies.upsertWidget }),
  getUpsertRecordWidgetInteractor: () => ({ invoke: spies.upsertRecordWidget }),
  getUpsertRecordActivityWidgetInteractor: () => ({
    invoke: spies.upsertRecordActivityWidget,
  }),
}));

import { WidgetKind } from "@/generated/prisma";
import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { DisplayType } from "@/features/widget/widget.schema";

import { manageWidgetsTool } from "../widget.mcp-tools";
import { mcpToolResultText } from "../mcp-tool";
import { formatDatesInResponse } from "../utils";

const WIDGET_ID = "16000000-0000-4000-8000-000000000001";
const RECORD_ID = "16000000-0000-4000-8000-000000000002";
const relationshipFilter = {
  kind: "record" as const,
  typeId: RECORD_ID,
  operator: "in" as const,
  recordIds: [RECORD_ID],
};
const activityQuery = RecordActivityQuerySchema.parse({
  scope: { records: [], typeIds: [RECORD_ID] },
  kinds: ["audit", "message"],
  filters: [relationshipFilter],
});
const activityPreconditions = {
  expectedRevision: 3,
  idempotencyKey: "activity-widget-retry",
};

function chartWidget(overrides: Partial<RecordWidgetDto> = {}): RecordWidgetDto {
  return {
    id: WIDGET_ID,
    userId: mockUser.id,
    companyId: mockUser.companyId,
    kind: "chart",
    version: 1,
    name: "Deals",
    measure: RecordMeasureSchema.parse({
      source: { typeId: RECORD_ID },
      aggregation: "count",
      valueFieldId: null,
      groupBy: null,
    }),
    displayOptions: {
      displayType: DisplayType.verticalBarChart,
      showFilters: false,
    },
    data: {
      schemaRevision: 3,
      attribution: "full",
      groups: [],
      total: {
        count: 0,
        result: {
          state: "value",
          value: { kind: "decimal", value: "0", currency: null },
        },
      },
    },
    status: "ready",
    groupOptions: [],
    layout: null,
    isTemplate: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

function activityWidget(overrides: Partial<RecordActivityWidgetDto> = {}): RecordActivityWidgetDto {
  return {
    id: WIDGET_ID,
    userId: mockUser.id,
    companyId: mockUser.companyId,
    kind: WidgetKind.activityTimeline,
    name: "Recent activity",
    activityQuery,
    version: 1,
    schemaRevision: 3,
    status: "ready",
    data: { items: [], availableSources: ["audit"], nextCursor: null },
    displayOptions: { showFilters: false },
    layout: null,
    isTemplate: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

async function run(args: Record<string, unknown>) {
  return mcpToolResultText(await manageWidgetsTool.execute(args));
}

const chartCreate = {
  action: "create",
  name: "Deals",
  measure: chartWidget().measure,
  displayOptions: chartWidget().displayOptions,
  expectedRevision: 3,
  idempotencyKey: "widget-retry-key",
} as const;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("manage_widgets create", () => {
  it("creates a record measure through the shared version-two interactor", async () => {
    spies.upsertRecordWidget.mockResolvedValue({
      ok: true,
      data: chartWidget(),
    });
    const result = await run(chartCreate);
    expect(spies.upsertRecordWidget).toHaveBeenCalledWith({
      name: "Deals",
      measure: chartCreate.measure,
      displayOptions: chartCreate.displayOptions,
      expectedRevision: 3,
      idempotencyKey: "widget-retry-key",
      isTemplate: false,
    });
    expect(spies.upsertWidget).not.toHaveBeenCalled();
    expect(decode(result)).toEqual({
      id: WIDGET_ID,
      kind: "chart",
      name: "Deals",
      version: 1,
    });
  });
  it("creates a chart at a requested grid position in the same call and echoes the saved layout", async () => {
    const layout = { x: 4, y: 2, w: 6, h: 3 };
    spies.upsertRecordWidget.mockResolvedValue({
      ok: true,
      data: { ...chartWidget(), layout: { lg: { i: WIDGET_ID, ...layout } } },
    });
    const result = await run({ ...chartCreate, layout });
    expect(spies.upsertRecordWidget).toHaveBeenCalledWith(expect.objectContaining({ layout }));
    expect(decode(result)).toMatchObject({ id: WIDGET_ID, layout });
    expect(await run({ ...chartCreate, layout: { x: 8, y: 0, w: 6, h: 3 } })).toContain("Validation error:");
    expect(spies.upsertRecordWidget).toHaveBeenCalledTimes(1);
  });

  it("rejects retired entity chart contracts and missing concurrency preconditions", async () => {
    expect(await run({ action: "create", name: "Legacy", entityType: "deal" })).toContain("Validation error:");
    const incomplete = { ...chartCreate, expectedRevision: undefined };
    expect(await run(incomplete)).toContain("Validation error:");
    expect(spies.upsertRecordWidget).not.toHaveBeenCalled();
    expect(spies.upsertWidget).not.toHaveBeenCalled();
  });

  it("creates a generic activity widget through the versioned interactor", async () => {
    spies.upsertRecordActivityWidget.mockResolvedValue({
      ok: true,
      data: activityWidget(),
    });
    const result = await run({
      action: "create",
      kind: "activityTimeline",
      name: "Recent activity",
      activityQuery,
      ...activityPreconditions,
      showFilters: false,
    });
    expect(spies.upsertRecordActivityWidget).toHaveBeenCalledWith({
      name: "Recent activity",
      activityQuery,
      ...activityPreconditions,
      displayOptions: { showFilters: false },
      isTemplate: false,
    });
    expect(spies.upsertWidget).not.toHaveBeenCalled();
    expect(decode(result)).toEqual({
      id: WIDGET_ID,
      kind: "activityTimeline",
      name: "Recent activity",
      version: 1,
    });
  });
  it("rejects omitted preconditions and retired activity filters without writing", async () => {
    expect(
      await run({
        action: "create",
        kind: "activityTimeline",
        name: "Recent activity",
        activityQuery,
      }),
    ).toContain("Validation error:");
    expect(
      await run({
        action: "create",
        kind: "activityTimeline",
        name: "Recent activity",
        timelineFilters: [],
        ...activityPreconditions,
      }),
    ).toContain("Validation error:");
    expect(spies.upsertRecordActivityWidget).not.toHaveBeenCalled();
  });

  it("rejects fields from the other widget kind", async () => {
    expect(await run({ ...chartCreate, timelineFilters: [relationshipFilter] })).toContain("Validation error:");
    expect(
      await run({
        action: "create",
        kind: WidgetKind.activityTimeline,
        name: "Recent activity",
        entityType: "contact",
      }),
    ).toContain("Validation error:");
    expect(spies.upsertWidget).not.toHaveBeenCalled();
  });

  it("enforces bounded, typed record filter shapes", () => {
    const base = {
      action: "create",
      kind: "activityTimeline",
      name: "Recent activity",
      ...activityPreconditions,
    };
    for (const filters of [
      [{ ...relationshipFilter, recordIds: [] }],
      [{ ...relationshipFilter, operator: "hasSome" }],
      Array.from({ length: 21 }, () => relationshipFilter),
      [{ ...relationshipFilter, workspaceId: RECORD_ID }],
    ]) {
      expect(
        manageWidgetsTool.inputSchema.safeParse({
          ...base,
          activityQuery: { ...activityQuery, filters },
        }).success,
      ).toBe(false);
    }
    expect(
      manageWidgetsTool.inputSchema.safeParse({
        ...base,
        activityQuery: {
          ...activityQuery,
          filters: [relationshipFilter, { kind: "source", operator: "notIn", values: ["message"] }],
        },
      }).success,
    ).toBe(true);
  });
});

describe("manage_widgets update", () => {
  it("preserves omitted chart fields and forwards the caller's concurrency preconditions", async () => {
    const stored = chartWidget();
    spies.getWidgetById.mockResolvedValue({ ok: true, data: stored });
    spies.upsertRecordWidget.mockResolvedValue({
      ok: true,
      data: chartWidget({ name: "Renamed", version: 2 }),
    });
    const result = await run({
      action: "update",
      id: WIDGET_ID,
      name: "Renamed",
      expectedRevision: 3,
      expectedVersion: 1,
      idempotencyKey: "update-retry-key",
    });
    expect(spies.upsertRecordWidget).toHaveBeenCalledWith({
      id: WIDGET_ID,
      name: "Renamed",
      expectedRevision: 3,
      expectedVersion: 1,
      idempotencyKey: "update-retry-key",
      measure: stored.measure,
      displayOptions: stored.displayOptions,
      isTemplate: false,
    });
    expect(decode(result)).toMatchObject({
      kind: "chart",
      name: "Renamed",
      version: 2,
    });
  });

  it("preserves omitted timeline configuration with explicit concurrency preconditions", async () => {
    spies.getWidgetById.mockResolvedValue({ ok: true, data: activityWidget() });
    spies.upsertRecordActivityWidget.mockResolvedValue({
      ok: true,
      data: activityWidget({ name: "Renamed", version: 2 }),
    });
    const result = await run({
      action: "update",
      id: WIDGET_ID,
      name: "Renamed",
      expectedVersion: 1,
      ...activityPreconditions,
    });
    expect(spies.upsertRecordActivityWidget).toHaveBeenCalledWith({
      id: WIDGET_ID,
      name: "Renamed",
      expectedVersion: 1,
      ...activityPreconditions,
      activityQuery,
      displayOptions: { showFilters: false },
      isTemplate: false,
    });
    expect(decode(result)).toMatchObject({
      kind: "activityTimeline",
      version: 2,
    });
  });
  it("clears filters only with an explicit replacement query and retains false", async () => {
    const replacement = { ...activityQuery, filters: [] };
    spies.getWidgetById.mockResolvedValue({ ok: true, data: activityWidget() });
    spies.upsertRecordActivityWidget.mockResolvedValue({
      ok: true,
      data: activityWidget({ activityQuery: replacement }),
    });
    await run({
      action: "update",
      id: WIDGET_ID,
      expectedVersion: 1,
      ...activityPreconditions,
      activityQuery: replacement,
      showFilters: false,
    });
    expect(spies.upsertRecordActivityWidget).toHaveBeenCalledWith(
      expect.objectContaining({
        activityQuery: replacement,
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
        kind: WidgetKind.chart,
      }),
    ).toContain("Validation error:");
    expect(
      await run({
        action: "update",
        id: WIDGET_ID,
        aggregationType: "count",
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
        {
          id: WIDGET_ID,
          name: "Deals",
          kind: WidgetKind.chart,
          version: 1,
          layout: { x: 0, y: 0, w: 4, h: 4 },
        },
        {
          id: RECORD_ID,
          name: "Recent activity",
          kind: WidgetKind.activityTimeline,
          version: 1,
          layout: { x: 4, y: 0, w: 6, h: 4 },
        },
      ],
      total: 2,
    });

    spies.getWidgetById.mockResolvedValueOnce({ ok: true, data: chartWidget() }).mockResolvedValueOnce({
      ok: true,
      data: activityWidget({ id: RECORD_ID }),
    });
    const get = await run({ action: "get", ids: [WIDGET_ID, RECORD_ID] });
    expect(decode(get)).toEqual({
      items: formatDatesInResponse([chartWidget(), activityWidget({ id: RECORD_ID })]),
    });
  });

  it("answers a missing id with an id-keyed error that fits the output schema and keeps the found widgets", async () => {
    spies.getWidgetById
      .mockResolvedValueOnce({ ok: true, data: chartWidget() })
      .mockResolvedValueOnce({ ok: true, data: null });

    const output = await manageWidgetsTool.execute(
      manageWidgetsTool.inputSchema.parse({
        action: "get",
        ids: [WIDGET_ID, RECORD_ID],
      }),
    );

    if (typeof output === "string" || !("structuredContent" in output))
      throw new Error("Expected a structured MCP result");
    expect(manageWidgetsTool.outputSchema.safeParse(output.structuredContent).success).toBe(true);
    expect(decode(output.text)).toEqual({
      items: formatDatesInResponse([chartWidget(), { id: RECORD_ID, error: "Widget ID not found or not accessible." }]),
    });
  });

  it("deletes either stored kind after existence is confirmed", async () => {
    spies.getWidgetById.mockResolvedValue({ ok: true, data: activityWidget() });
    spies.deleteWidget.mockResolvedValue({ ok: true, data: WIDGET_ID });

    expect(decode(await run({ action: "delete", id: WIDGET_ID }))).toEqual({
      id: WIDGET_ID,
      deleted: true,
    });
    expect(spies.deleteWidget).toHaveBeenCalledWith({ id: WIDGET_ID });
  });
});

describe("manage_widgets description", () => {
  it("keeps widgets for widget requests and sends data questions to the record query tools", () => {
    expect(manageWidgetsTool.description).toContain(
      "Use this when the user asks to see, create, change or delete their dashboard widgets. A widget you create stays on their dashboard, so never create or update one to work out an answer; answer data questions with query_crm_measure or query_crm_records instead.",
    );
    expect(manageWidgetsTool.description).not.toContain("answers questions like");
    expect(manageWidgetsTool.description).not.toContain("analyze_records");
  });
});
