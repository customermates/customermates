import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ENV_MODULE, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const {
  client,
  companyFindUnique,
  customColumnDeleteMany,
  dataViewOverrideUpdateMany,
  dataViewUpdateMany,
  p13nDeleteMany,
  p13nUpdateMany,
  widgetDeleteMany,
} = vi.hoisted(() => {
  const mocks = {
    companyFindUnique: vi.fn(),
    customColumnDeleteMany: vi.fn(),
    dataViewOverrideUpdateMany: vi.fn(),
    dataViewUpdateMany: vi.fn(),
    p13nDeleteMany: vi.fn(),
    p13nUpdateMany: vi.fn(),
    widgetDeleteMany: vi.fn(),
  };

  return {
    ...mocks,
    client: {
      $executeRaw: vi.fn().mockResolvedValue(undefined),
      auditLog: { createMany: vi.fn() },
      webhookDelivery: { createMany: vi.fn() },
      company: { findUnique: mocks.companyFindUnique },
      customColumn: { deleteMany: mocks.customColumnDeleteMany },
      dataView: { updateMany: mocks.dataViewUpdateMany },
      dataViewOverride: { updateMany: mocks.dataViewOverrideUpdateMany },
      p13n: { deleteMany: mocks.p13nDeleteMany, updateMany: mocks.p13nUpdateMany },
      widget: { deleteMany: mocks.widgetDeleteMany },
    },
  };
});

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => ({
  prisma: {
    ...client,
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(client)),
    $extends: vi.fn().mockReturnThis(),
  },
}));

import { Prisma } from "@/generated/prisma";

import { PrismaCustomColumnRepo } from "../prisma-custom-column.repository";
import { runWithTenant } from "@/core/decorators/tenant-context";

const A_COLUMN_ID = "8f1c1a4e-0b2d-4a9e-9d7c-1f2a3b4c5d6e";

const CLEARED = { groupingColumnId: null, grouping: Prisma.DbNull };

describe("deleting a custom column that surfaces group state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    companyFindUnique.mockResolvedValue({ dealWeightingColumnId: null });
  });

  it("clears the grouping on every table that stores it and deletes no personalization row", async () => {
    await runWithTenant(mockUser, () => new PrismaCustomColumnRepo().delete(A_COLUMN_ID));

    const where = { companyId: mockUser.companyId, groupingColumnId: A_COLUMN_ID };

    expect(p13nUpdateMany).toHaveBeenCalledWith({ where, data: CLEARED });
    expect(dataViewUpdateMany).toHaveBeenCalledWith({ where, data: CLEARED });
    expect(dataViewOverrideUpdateMany).toHaveBeenCalledWith({ where, data: CLEARED });
    expect(p13nDeleteMany).not.toHaveBeenCalled();
  });

  it("leaves every other personalization field alone, which the old deleteMany did not", async () => {
    await runWithTenant(mockUser, () => new PrismaCustomColumnRepo().delete(A_COLUMN_ID));

    const written = Object.keys(p13nUpdateMany.mock.calls[0][0].data).sort();

    expect(written).toEqual(["grouping", "groupingColumnId"]);
    for (const field of ["filters", "columnOrder", "columnWidths", "hiddenColumns", "sortDescriptor"])
      expect([field, written.includes(field)]).toEqual([field, false]);
  });

  it("scopes every clear by a top level companyId so the tenant guard accepts it", async () => {
    await runWithTenant(mockUser, () => new PrismaCustomColumnRepo().delete(A_COLUMN_ID));

    for (const call of [p13nUpdateMany, dataViewUpdateMany, dataViewOverrideUpdateMany])
      expect(call.mock.calls[0][0].where.companyId).toBe(mockUser.companyId);
  });

  it("still deletes the column itself and the widgets grouped by it", async () => {
    await runWithTenant(mockUser, () => new PrismaCustomColumnRepo().delete(A_COLUMN_ID));

    expect(customColumnDeleteMany).toHaveBeenCalledWith({
      where: { id: A_COLUMN_ID, companyId: mockUser.companyId },
    });
    expect(widgetDeleteMany).toHaveBeenCalledWith({
      where: { groupByCustomColumnId: A_COLUMN_ID, companyId: mockUser.companyId },
    });
  });
});
