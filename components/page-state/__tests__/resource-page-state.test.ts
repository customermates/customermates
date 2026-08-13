import { describe, expect, it } from "vitest";

import { resolveResourcePageState } from "../resource-page-state";

describe("resolveResourcePageState", () => {
  it.each([
    [{ status: "uninitialized" } as const, 0, "loading"],
    [{ status: "refreshing" } as const, 0, "loading"],
    [{ status: "ready" } as const, 0, "true-empty"],
    [{ status: "ready" } as const, 2, "content"],
    [{ status: "refresh-error", error: new Error("failed") } as const, 0, "error"],
    [{ status: "refresh-error", error: new Error("failed") } as const, 2, "content"],
  ])("maps %o with %i items to %s", (request, itemCount, expected) => {
    expect(resolveResourcePageState(request, itemCount)).toBe(expected);
  });
});
