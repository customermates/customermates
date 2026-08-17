import { describe, expect, it } from "vitest";

import { computeHasMore } from "../activities-paging";

function result(itemCount: number, total?: number) {
  return {
    items: Array.from({ length: itemCount }, (_, index) => ({
      id: `entry-${index}`,
    })),
    ...(total === undefined
      ? {}
      : { pagination: { page: 1, pageSize: 25 as const, total, totalPages: Math.ceil(total / 25) } }),
  };
}

describe("computeHasMore", () => {
  it("reports more while the reported total exceeds what the pages so far cover", () => {
    expect(computeHasMore(result(25, 60), 1)).toBe(true);
    expect(computeHasMore(result(25, 60), 2)).toBe(true);
  });

  it("stops once the pages so far cover the reported total", () => {
    expect(computeHasMore(result(10, 60), 3)).toBe(false);
    expect(computeHasMore(result(25, 50), 2)).toBe(false);
  });

  it("falls back to a full page meaning there may be more when no total is reported", () => {
    expect(computeHasMore(result(25), 1)).toBe(true);
    expect(computeHasMore(result(24), 1)).toBe(false);
    expect(computeHasMore(result(0), 1)).toBe(false);
  });

  it("honours a per-store page size so widgets and the entity panel can differ", () => {
    expect(computeHasMore(result(10, 30), 1, 10)).toBe(true);
    expect(computeHasMore(result(10, 30), 3, 10)).toBe(false);
    expect(computeHasMore(result(10), 1, 10)).toBe(true);
    expect(computeHasMore(result(9), 1, 10)).toBe(false);
  });

  it("never advertises a page past the server cap", () => {
    expect(computeHasMore(result(25, 2_000), 39)).toBe(true);
    expect(computeHasMore(result(25, 2_000), 40)).toBe(false);
  });
});
