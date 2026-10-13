import { runWithTenant } from "@/core/decorators/tenant-context";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaWidgetRepo } from "../prisma-widget.repository";
import { LIVE_WIDGET } from "../live-widget";
import { WidgetDtoReader } from "../widget-dto-reader";

const user = createMockUser();
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  deleteMany: vi.fn(),
  updateMany: vi.fn(),
  chart: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => user));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => {
  const tx = {
    $executeRaw: vi.fn(),
    widget: {
      findMany: mocks.findMany,
      findFirst: mocks.findFirst,
      deleteMany: mocks.deleteMany,
      updateMany: mocks.updateMany,
    },
    webhookDelivery: { createMany: vi.fn() },
  };
  return {
    ...MOCK_PRISMA_DB_MODULE,
    prisma: { ...MOCK_PRISMA_DB_MODULE.prisma, ...tx, $transaction: vi.fn((fn) => fn(tx)) },
  };
});

const typeId = randomUUID();
const row = (overrides: Record<string, unknown> = {}) => ({
  id: randomUUID(),
  userId: user.id,
  companyId: user.companyId,
  name: "Pipeline",
  kind: "chart",
  measure: { source: { typeId }, aggregation: "count", valueFieldId: null, groupBy: null },
  activityQuery: null,
  version: 2,
  displayOptions: { displayType: "verticalBarChart", showFilters: false },
  layout: null,
  viewId: null,
  isTemplate: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  ...overrides,
});
const readers = () => ({ chart: { read: mocks.chart }, activityTimeline: { read: mocks.activity } });
const scoped = <T>(fn: (repo: PrismaWidgetRepo) => Promise<T>) => runWithTenant(user, () => fn(new PrismaWidgetRepo()));

describe("generic widget repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.chart.mockImplementation((stored) =>
      Promise.resolve({
        ...stored,
        data: null,
        status: "unavailable",
        groupOptions: [],
      }),
    );
    mocks.activity.mockImplementation((stored) =>
      Promise.resolve({
        ...stored,
        schemaRevision: 2,
        data: null,
        status: "unavailable",
      }),
    );
  });
  it("returns stored chart definitions for the reader without calculating them", async () => {
    const stored = row();
    mocks.findMany.mockResolvedValue([stored]);
    const widgets = await scoped((repo) => repo.getWidgets());
    expect(widgets).toEqual([
      {
        kind: "chart",
        widget: expect.objectContaining({
          id: stored.id,
          measure: expect.objectContaining({
            ...stored.measure,
            source: expect.objectContaining(stored.measure.source),
          }),
        }),
      },
    ]);
    expect(mocks.chart).not.toHaveBeenCalled();
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id, companyId: user.companyId, ...LIVE_WIDGET } }),
    );
  });
  it("returns stored activity definitions as timelines", async () => {
    const stored = row({
      kind: "activityTimeline",
      measure: null,
      activityQuery: { scope: { records: [], typeIds: [] }, kinds: ["audit"] },
      displayOptions: { showFilters: true },
    });
    mocks.findFirst.mockResolvedValue(stored);
    const result = await scoped((repo) => repo.getWidgetById(stored.id));
    expect(result).toEqual({
      kind: "activityTimeline",
      widget: expect.objectContaining({ id: stored.id, activityQuery: stored.activityQuery }),
    });
    expect(mocks.activity).not.toHaveBeenCalled();
  });
  it("includes only owned records or shared templates in a single read", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const id = randomUUID();
    expect(await scoped((repo) => repo.getWidgetById(id))).toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id, companyId: user.companyId, OR: [{ userId: user.id }, { isTemplate: true }], ...LIVE_WIDGET },
      }),
    );
  });
  it("refuses a widget without a record definition instead of guessing one", async () => {
    mocks.findMany.mockResolvedValue([row({ measure: null })]);
    await expect(scoped((repo) => repo.getWidgets())).rejects.toThrow("has no record definition");
  });
  it("uses validated structured definitions", async () => {
    mocks.findMany.mockResolvedValue([row({ measure: { sourceTypeId: "invalid" } })]);
    await expect(scoped((repo) => repo.getWidgets())).rejects.toThrow();
  });
  it("resolves its record widget readers only when it reads a widget", async () => {
    const lazyReaders = vi.fn(readers);
    const reader = new WidgetDtoReader(lazyReaders);
    expect(lazyReaders).not.toHaveBeenCalled();

    await reader.read({ kind: "chart", widget: { id: "chart" } as never });

    expect(lazyReaders).toHaveBeenCalledTimes(1);
    expect(mocks.chart).toHaveBeenCalledTimes(1);
  });
  it("reads each stored kind through its authoritative reader only", async () => {
    const reader = new WidgetDtoReader(readers);
    const chart = { kind: "chart" as const, widget: { id: "chart" } as never };
    const timeline = { kind: "activityTimeline" as const, widget: { id: "timeline" } as never };
    await expect(reader.read(chart)).resolves.toMatchObject({ id: "chart", status: "unavailable" });
    await expect(reader.read(timeline)).resolves.toMatchObject({ id: "timeline", schemaRevision: 2 });
    expect(mocks.chart).toHaveBeenCalledExactlyOnceWith({ id: "chart" });
    expect(mocks.activity).toHaveBeenCalledExactlyOnceWith({ id: "timeline" });
  });
  it("moves only a live widget of the owner and tenant to Trash", async () => {
    const id = randomUUID();
    mocks.findFirst.mockResolvedValue({ name: "Pipeline" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    expect(await scoped((repo) => repo.trashWidget(id))).toEqual({ name: "Pipeline" });
    expect(mocks.findFirst).toHaveBeenCalledWith({
      where: { id, companyId: user.companyId, userId: user.id, ...LIVE_WIDGET },
      select: { name: true },
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id, companyId: user.companyId, userId: user.id },
      data: { deletedAt: expect.any(Date) },
    });
  });
  it("filters ID selection by both owner and tenant", async () => {
    const id = randomUUID();
    mocks.findMany.mockResolvedValue([{ id }]);
    expect(await scoped((repo) => repo.findIds(new Set([id, randomUUID()])))).toEqual(new Set([id]));
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: expect.any(Array) }, companyId: user.companyId, userId: user.id, ...LIVE_WIDGET },
      }),
    );
    mocks.findMany.mockClear();
    expect(await scoped((repo) => repo.findIds(new Set()))).toEqual(new Set());
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("discovers templates in the active workspace", async () => {
    mocks.findMany.mockResolvedValue([
      { ...row({ isTemplate: true }), user: { firstName: "A", lastName: "B", avatarUrl: null } },
    ]);
    const result = await scoped((repo) => repo.getCompanyWidgets());
    expect(result).toHaveLength(1);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: user.companyId, isTemplate: true, ...LIVE_WIDGET },
        orderBy: { name: "asc" },
      }),
    );
  });
});
