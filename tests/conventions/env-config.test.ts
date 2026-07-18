import { describe, expect, it } from "vitest";

import { resolveAppMode } from "@/core/config/environment";

describe("application mode configuration", () => {
  it.each(["self-hosted", "cloud", "demo"] as const)("accepts %s", (mode) => {
    expect(resolveAppMode({ APP_MODE: mode })).toBe(mode);
  });

  it.each([undefined, "", " ", "production", "preview"])("rejects %s", (mode) => {
    expect(() => resolveAppMode({ APP_MODE: mode })).toThrow(/APP_MODE/);
  });
});
