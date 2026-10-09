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

const user = createMockUser();
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  deleteMany: vi.fn(),
  chart: vi.fn(),
  activity: vi.fn(),
}));
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => user),
  getRecordWidgetReader: () => ({ read: mocks.chart }),
  getRecordActivityWidgetReader: () => ({ read: mocks.activity }),
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => {
  const tx = {
    $executeRaw: vi.fn(),
    widget: { findMany: mocks.findMany, findFirst: mocks.findFirst, deleteMany: mocks.deleteMany },
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
  it("reads generic chart definitions through the authoritative reader", async () => {
    const stored = row();
    mocks.findMany.mockResolvedValue([stored]);
    const widgets = await scoped((repo) => repo.getWidgets());
    expect(mocks.chart).toHaveBeenCalledWith(
      expect.objectContaining({
        id: stored.id,
        measure: expect.objectContaining({ ...stored.measure, source: expect.objectContaining(stored.measure.source) }),
      }),
    );
    expect(widgets).toEqual([expect.objectContaining({ id: stored.id, status: "unavailable" })]);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id, companyId: user.companyId } }),
    );
  });
  it("reads generic activity definitions without crossing into chart calculations", async () => {
    const stored = row({
      kind: "activityTimeline",
      measure: null,
      activityQuery: { scope: { records: [], typeIds: [] }, kinds: ["audit"] },
      displayOptions: { showFilters: true },
    });
    mocks.findFirst.mockResolvedValue(stored);
    const result = await scoped((repo) => repo.getWidgetById(stored.id));
    expect(mocks.activity).toHaveBeenCalledWith(expect.objectContaining({ activityQuery: stored.activityQuery }));
    expect(mocks.chart).not.toHaveBeenCalled();
    expect(result).toMatchObject({ schemaRevision: 2, kind: "activityTimeline" });
  });
  it("includes only owned records or shared templates in a single read", async () => {
    mocks.findFirst.mockResolvedValue(null);
    const id = randomUUID();
    expect(await scoped((repo) => repo.getWidgetById(id))).toBeNull();
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id, companyId: user.companyId, OR: [{ userId: user.id }, { isTemplate: true }] },
      }),
    );
  });
  it("refuses a widget without a record definition instead of guessing one", async () => {
    mocks.findMany.mockResolvedValue([row({ measure: null })]);
    await expect(scoped((repo) => repo.getWidgets())).rejects.toThrow("has no record definition");
    expect(mocks.chart).not.toHaveBeenCalled();
  });
  it("uses validated structured definitions", async () => {
    mocks.findMany.mockResolvedValue([row({ measure: { sourceTypeId: "invalid" } })]);
    await expect(scoped((repo) => repo.getWidgets())).rejects.toThrow();
    expect(mocks.chart).not.toHaveBeenCalled();
  });
  it("scopes deletion to the owner and tenant", async () => {
    const id = randomUUID();
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    await scoped((repo) => repo.trashWidget(id));
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { id, companyId: user.companyId, userId: user.id } });
  });
  it("filters ID selection by both owner and tenant", async () => {
    const id = randomUUID();
    mocks.findMany.mockResolvedValue([{ id }]);
    expect(await scoped((repo) => repo.findIds(new Set([id, randomUUID()])))).toEqual(new Set([id]));
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: expect.any(Array) }, companyId: user.companyId, userId: user.id } }),
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
      expect.objectContaining({ where: { companyId: user.companyId, isTemplate: true }, orderBy: { name: "asc" } }),
    );
  });
});
