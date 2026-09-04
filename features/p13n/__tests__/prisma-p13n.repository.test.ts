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

import type { Grouping } from "@/core/base/grouping/grouping.schema";

import { PrismaP13nRepo } from "../prisma-p13n.repository";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { runWithTenant } from "@/core/decorators/tenant-context";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { CLEARED_GROUPING } from "@/core/base/grouping/stored-grouping";

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
      grouping: null,
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
      grouping: null,
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
      grouping: null,
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
      grouping: null,
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

describe("PrismaP13nRepo grouping storage", () => {
  const A_COLUMN_ID = "3f0d2c6b-8b1a-4c5e-9d7f-1a2b3c4d5e6f";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function storedRow(overrides: Record<string, unknown> = {}) {
    return {
      activeViewKey: null,
      filters: null,
      searchTerm: null,
      sortDescriptor: null,
      pagination: null,
      columnOrder: [],
      columnWidths: null,
      hiddenColumns: [],
      viewMode: null,
      groupingColumnId: null,
      grouping: null,
      detailOptions: null,
      ...overrides,
    };
  }

  async function write(grouping: Grouping | null) {
    p13nUpsert.mockResolvedValue(storedRow());
    await runWithTenant(mockUser, () => new PrismaP13nRepo().upsertP13n({ p13nId: "deals", grouping }));

    return p13nUpsert.mock.lastCall?.[0] as {
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    };
  }

  it("derives the indexed shadow from a custom column descriptor", async () => {
    const args = await write({ field: A_COLUMN_ID });

    expect(args.create.groupingColumnId).toBe(A_COLUMN_ID);
    expect(args.update.groupingColumnId).toBe(A_COLUMN_ID);
    expect(args.update.grouping).toEqual({ field: A_COLUMN_ID });
  });

  it("stores a non custom column descriptor with a null shadow rather than a bogus uuid", async () => {
    const relation = await write({ field: "userIds" });

    expect(relation.update.groupingColumnId).toBeNull();
    expect(relation.update.grouping).toEqual({ field: "userIds" });

    const dated = await write({ field: "createdAt", bucket: "month" });

    expect(dated.update.groupingColumnId).toBeNull();
    expect(dated.update.grouping).toEqual({ field: "createdAt", bucket: "month" });
  });

  it("writes the cleared sentinel rather than json null so a later read cannot lift the legacy column", async () => {
    const args = await write(null);

    expect(args.update.groupingColumnId).toBeNull();
    expect(args.update.grouping).toEqual(CLEARED_GROUPING);
  });

  it("leaves both fields out of the update entirely when the caller says nothing about grouping", async () => {
    p13nUpsert.mockResolvedValue(storedRow());
    await runWithTenant(mockUser, () => new PrismaP13nRepo().upsertP13n({ p13nId: "deals", searchTerm: "acme" }));
    const args = p13nUpsert.mock.lastCall?.[0] as { update: Record<string, unknown> };

    expect(Object.keys(args.update)).not.toContain("grouping");
    expect(Object.keys(args.update)).not.toContain("groupingColumnId");
  });

  it("reads the descriptor back and keeps the shadow it was stored with", async () => {
    p13nFindUnique.mockResolvedValue(
      storedRow({ p13nId: "deals", grouping: { field: A_COLUMN_ID }, groupingColumnId: A_COLUMN_ID }),
    );

    const read = await runWithTenant(mockUser, () => new PrismaP13nRepo().getP13n("deals"));

    expect(read?.grouping).toEqual({ field: A_COLUMN_ID });
    expect(read?.groupingColumnId).toBe(A_COLUMN_ID);
  });
});
