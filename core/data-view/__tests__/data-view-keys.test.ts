import { z } from "zod";
import { describe, expect, it } from "vitest";

import { ALL_VIEW_KEY, DATA_VIEW_SURFACE_KEYS, SURFACE } from "../data-view-keys";

describe("data view keys", () => {
  it("keeps the All key outside the uuid space so it can never collide with a view id", () => {
    expect(z.uuid().safeParse(ALL_VIEW_KEY).success).toBe(false);
    expect(ALL_VIEW_KEY).toBe("__all__");
  });

  it("lists every surface key exactly once", () => {
    expect(new Set(DATA_VIEW_SURFACE_KEYS).size).toBe(DATA_VIEW_SURFACE_KEYS.length);
    expect(new Set(Object.values(SURFACE)).size).toBe(Object.values(SURFACE).length);
    expect([...DATA_VIEW_SURFACE_KEYS].sort()).toEqual([...Object.values(SURFACE)].sort());
  });
});
