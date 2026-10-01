import { describe, expect, it, vi } from "vitest";
import { countGroupRows } from "../group-count";
import { enumGroupable, relationGroupable } from "../groupable-field";
import { NO_VALUE_GROUP_KEY } from "../grouping.schema";

describe("system group query scope threading", () => {
  it("threads tenant and member access through both relation counts", async () => {
    const count = vi.fn().mockResolvedValue(1),
      groupBy = vi.fn().mockResolvedValue([{ ownerUserId: "member", _count: { _all: 2 } }]);
    const targetWhere = vi.fn().mockReturnValue({ companyId: "tenant", id: "member" });
    const rows = await countGroupRows(
      { companyId: "tenant", delegate: () => ({ count, groupBy }), targetWhere },
      {
        spec: relationGroupable({ model: "routine", field: "ownerUserId" }),
        where: { companyId: "tenant", enabled: true },
      },
    );
    expect(rows).toEqual([
      { key: "member", count: 2 },
      { key: NO_VALUE_GROUP_KEY, count: 1 },
    ]);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "tenant", enabled: true, AND: [{ owner: { companyId: "tenant", id: "member" } }] },
      }),
    );
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: "tenant", enabled: true, AND: [{ NOT: { owner: { companyId: "tenant", id: "member" } } }] },
      }),
    );
  });
  it("sums at the source enum grain within the supplied scope", async () => {
    const groupBy = vi.fn().mockResolvedValue([{ status: "active", _count: { _all: 2 }, _sum: { allowance: 100 } }]);
    const rows = await countGroupRows(
      { companyId: "tenant", delegate: () => ({ count: vi.fn(), groupBy }), targetWhere: () => ({}) },
      {
        spec: enumGroupable({ model: "user", field: "status" }),
        where: { companyId: "tenant" },
        sumFields: ["allowance"],
      },
    );
    expect(rows).toEqual([{ key: "active", count: 2, sums: { allowance: 100 } }]);
    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { companyId: "tenant" }, _sum: { allowance: true } }),
    );
  });
});
