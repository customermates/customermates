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
        widget: { findMany: widgetFindMany, findFirst: widgetFindFirst, upsert: widgetUpsert },
      }),
    ),
    widget: { findMany: widgetFindMany, findFirst: widgetFindFirst, upsert: widgetUpsert },
  },
}));

import { PrismaWidgetRepo } from "../prisma-widget.repository";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

const WIDGET_ID = "00000000-0000-4000-8000-000000000001";

function legacyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: WIDGET_ID,
    userId: mockUser.id,
    companyId: mockUser.companyId,
    name: "Legacy",
    entityType: EntityType.deal,
    entityFilters: null,
    dealFilters: null,
    displayOptions: null,
    groupByType: WidgetGroupByType.none,
    groupByCustomColumnId: null,
    aggregationType: AggregationType.count,
    layout: null,
    isTemplate: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe("PrismaWidgetRepo.toDto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calculateWidgetData.mockResolvedValue([{ label: "Total", value: 3 }]);
  });

  it("normalizes null filter columns to empty arrays so the DTO gate cannot throw", async () => {
    widgetFindMany.mockResolvedValue([legacyRow()]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(widgets[0].entityFilters).toEqual([]);
    expect(widgets[0].dealFilters).toEqual([]);
  });

  it("leaves null configuration columns null rather than inventing a default", async () => {
    widgetFindMany.mockResolvedValue([legacyRow()]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(widgets[0].displayOptions).toBeNull();
    expect(widgets[0].layout).toBeNull();
  });

  it("hands the calculator normalized filters and no calculated data", async () => {
    widgetFindMany.mockResolvedValue([legacyRow()]);

    await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    const input = calculateWidgetData.mock.calls[0][0];

    expect(input).not.toHaveProperty("data");
    expect(input.entityFilters).toEqual([]);
    expect(input.dealFilters).toEqual([]);
  });

  it("attaches calculated data to the completed DTO", async () => {
    widgetFindMany.mockResolvedValue([legacyRow()]);

    const widgets = await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(widgets[0].data).toEqual([{ label: "Total", value: 3 }]);
  });

  it("reads through the explicit select, scoped to the tenant", async () => {
    widgetFindMany.mockResolvedValue([]);

    await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgets());

    expect(widgetFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: mockUser.id, companyId: mockUser.companyId } }),
    );
    expect(widgetFindMany.mock.calls[0][0].select).toHaveProperty("entityFilters", true);
  });

  it("scopes a single widget read to the company", async () => {
    widgetFindFirst.mockResolvedValue(null);

    await runWithTenant(mockUser, () => new PrismaWidgetRepo().getWidgetById(WIDGET_ID));

    expect(widgetFindFirst.mock.calls[0][0].where).toEqual({ id: WIDGET_ID, companyId: mockUser.companyId });
  });

  it("persists absent filters as empty arrays rather than JSON null", async () => {
    widgetUpsert.mockResolvedValue(legacyRow());

    await runWithTenant(mockUser, () =>
      new PrismaWidgetRepo().upsertWidget({
        data: {
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

    expect(widget?.entityFilters).toEqual([]);
    expect(widget?.displayOptions).toBeNull();
    expect(widget?.data).toEqual([{ label: "Total", value: 3 }]);
  });
});
