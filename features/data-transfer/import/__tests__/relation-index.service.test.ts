import { beforeEach, describe, expect, it, vi } from "vitest";

import { EntityType } from "@/generated/prisma";

import { RELATION_INDEX_LIMIT, RELATION_INDEX_PAGE_SIZE } from "../../data-transfer.schema";

const di = vi.hoisted(() => ({
  getContactRepo: vi.fn(),
  getOrganizationRepo: vi.fn(),
  getDealRepo: vi.fn(),
  getServiceRepo: vi.fn(),
  getTaskRepo: vi.fn(),
  getUserRepo: vi.fn(),
}));

vi.mock("@/core/di", () => di);

import { ImportRelationIndex } from "../relation-index.service";

type Loader = (params: { skip: number; take: number }) => Promise<Array<Record<string, unknown>>>;

function pagedRepo(total: number, build: (index: number) => Record<string, unknown>) {
  const load: Loader = ({ skip, take }) =>
    Promise.resolve(
      Array.from({ length: Math.max(0, Math.min(take, total - skip)) }, (_, offset) => build(skip + offset)),
    );

  return { exportItems: vi.fn(load), getItems: vi.fn(load) };
}

describe("ImportRelationIndex", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pages past the first page of users rather than refetching page one", async () => {
    const total = RELATION_INDEX_PAGE_SIZE * 2 + 7;
    const repo = pagedRepo(total, (index) => ({ id: `user-${index}`, firstName: "User", lastName: `${index}` }));
    di.getUserRepo.mockReturnValue(repo);

    const result = await new ImportRelationIndex().build([], true);

    expect(result.index.user).toHaveLength(total);
    expect(result.index.user?.at(-1)).toEqual([`user ${total - 1}`, `user-${total - 1}`]);
    expect(repo.getItems.mock.calls.map((call) => call[0].skip)).toEqual([
      0,
      RELATION_INDEX_PAGE_SIZE,
      RELATION_INDEX_PAGE_SIZE * 2,
    ]);
    expect(result.truncated).toEqual([]);
  });

  it("stops at the ceiling and reports the relation as truncated", async () => {
    const repo = pagedRepo(RELATION_INDEX_LIMIT + 1, (index) => ({ id: `org-${index}`, name: `Org ${index}` }));
    di.getOrganizationRepo.mockReturnValue(repo);

    const result = await new ImportRelationIndex().build([EntityType.organization], false);

    expect(result.index.organization).toHaveLength(RELATION_INDEX_LIMIT);
    expect(result.truncated).toEqual([EntityType.organization]);
  });

  it("lower-cases labels and keeps every id for a duplicated label", async () => {
    const repo = pagedRepo(2, (index) => ({ id: `deal-${index}`, name: "Renewal" }));
    di.getDealRepo.mockReturnValue(repo);

    const result = await new ImportRelationIndex().build([EntityType.deal], false);

    expect(result.index.deal).toEqual([
      ["renewal", "deal-0"],
      ["renewal", "deal-1"],
    ]);
  });
});
