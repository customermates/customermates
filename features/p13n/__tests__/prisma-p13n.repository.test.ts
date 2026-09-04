import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const A_VIEW_KEY = "9c1f0a7e-0b6a-4b1d-9a4e-2d3f5b6c7a81";
const { p13nFindUnique, p13nUpsert } = vi.hoisted(() => ({
  p13nFindUnique: vi.fn(),
  p13nUpsert: vi.fn(),
}));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => ({
  ...MOCK_PRISMA_DB_MODULE,
  prisma: {
    ...MOCK_PRISMA_DB_MODULE.prisma,
    p13n: {
      findUnique: p13nFindUnique,
      upsert: p13nUpsert,
    },
  },
}));

import { PrismaP13nRepo } from "../prisma-p13n.repository";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";

describe("PrismaP13nRepo legacy filter normalization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves legacy relation filter behavior on read", async () => {
    p13nFindUnique.mockResolvedValue({
      companyId: mockUser.companyId,
      userId: mockUser.id,
      p13nId: "organizations",
      activeViewKey: null,
      filters: [
        {
          field: FilterFieldKey.dealIds,
          operator: FilterOperatorKey.hasNone,
          value: ["d1"],
        },
      ],
      searchTerm: null,
      sortDescriptor: null,
      pagination: null,
      columnOrder: [],
      columnWidths: null,
      hiddenColumns: [],
      viewMode: null,
      groupingColumnId: null,
    });

    const result = await runWithTenant(mockUser, () => new PrismaP13nRepo().getP13n("organizations"));

    expect(result?.filters).toEqual([
      {
        field: FilterFieldKey.dealIds,
        operator: FilterOperatorKey.notIn,
        value: ["d1"],
      },
    ]);
  });

  it("reads the remembered active view key and reports an unset one as undefined", async () => {
    const baseRow = {
      companyId: mockUser.companyId,
      userId: mockUser.id,
      p13nId: "organizations",
      filters: null,
      searchTerm: null,
      sortDescriptor: null,
      pagination: null,
      columnOrder: [],
      columnWidths: null,
      hiddenColumns: [],
      viewMode: null,
      groupingColumnId: null,
    };
    p13nFindUnique.mockResolvedValueOnce({ ...baseRow, activeViewKey: A_VIEW_KEY });

    const remembered = await runWithTenant(mockUser, () => new PrismaP13nRepo().getP13n("organizations"));

    expect(remembered?.activeViewKey).toBe(A_VIEW_KEY);

    p13nFindUnique.mockResolvedValueOnce({ ...baseRow, activeViewKey: null });

    const unset = await runWithTenant(mockUser, () => new PrismaP13nRepo().getP13n("organizations"));

    expect(unset?.activeViewKey).toBeUndefined();
  });

  it("reads valid entity detail options and ignores malformed options", async () => {
    const baseRow = {
      companyId: mockUser.companyId,
      userId: mockUser.id,
      p13nId: "contact-detail",
      filters: null,
      searchTerm: null,
      sortDescriptor: null,
      pagination: null,
      columnOrder: [],
      columnWidths: null,
      hiddenColumns: [],
      viewMode: null,
      groupingColumnId: null,
    };
    p13nFindUnique.mockResolvedValueOnce({
      ...baseRow,
      detailOptions: {
        starredFieldIds: ["identifiers", "custom-column"],
        collapsedSectionIds: ["notes"],
        hiddenFieldIds: ["createdAt"],
      },
    });

    const valid = await runWithTenant(mockUser, () => new PrismaP13nRepo().getP13n("contact-detail"));

    expect(valid?.detailOptions).toEqual({
      starredFieldIds: ["identifiers", "custom-column"],
      collapsedSectionIds: ["notes"],
      hiddenFieldIds: ["createdAt"],
    });

    p13nFindUnique.mockResolvedValueOnce({
      ...baseRow,
      detailOptions: { starredFieldIds: "identifiers" },
    });

    const malformed = await runWithTenant(mockUser, () => new PrismaP13nRepo().getP13n("contact-detail"));

    expect(malformed?.detailOptions).toBeUndefined();
  });

  it("persists entity detail options without replacing unrelated values on partial updates", async () => {
    const detailOptions = {
      starredFieldIds: ["identifiers"],
      collapsedSectionIds: ["notes"],
    };
    p13nUpsert.mockResolvedValue({
      activeViewKey: A_VIEW_KEY,
      filters: null,
      searchTerm: "existing",
      sortDescriptor: null,
      pagination: null,
      columnOrder: ["custom-column"],
      columnWidths: null,
      hiddenColumns: [],
      viewMode: null,
      groupingColumnId: null,
      detailOptions,
    });

    const result = await runWithTenant(mockUser, () =>
      new PrismaP13nRepo().upsertP13n({
        p13nId: "contact-detail",
        activeViewKey: A_VIEW_KEY,
        columnOrder: ["custom-column"],
        detailOptions,
      }),
    );

    expect(p13nUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          companyId: mockUser.companyId,
          userId: mockUser.id,
          p13nId: "contact-detail",
          activeViewKey: A_VIEW_KEY,
          columnOrder: ["custom-column"],
          detailOptions,
        },
      }),
    );
    expect(result.activeViewKey).toBe(A_VIEW_KEY);
    expect(result.detailOptions).toEqual(detailOptions);
  });
});
