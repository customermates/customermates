import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveAppMode } from "@/core/config/environment";

describe("application mode configuration", () => {
  it.each(["self-hosted", "cloud", "demo"] as const)("accepts %s", (mode) => {
    expect(resolveAppMode({ APP_MODE: mode })).toBe(mode);
  });

  it.each([undefined, "", " ", "production", "preview"])("rejects %s", (mode) => {
    expect(() => resolveAppMode({ APP_MODE: mode })).toThrow(/APP_MODE/);
  });
});

vi.mock("@sentry/nextjs", () => ({
  captureRouterTransitionStart: vi.fn(),
  init: vi.fn(),
}));
vi.mock("@/env", () => {
  throw new Error("client instrumentation imported the server environment");
});

describe("client instrumentation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not evaluate server-only application configuration", async () => {
    vi.stubEnv("APP_MODE", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    await expect(import("@/instrumentation-client")).resolves.toMatchObject({
      onRouterTransitionStart: undefined,
    });
  });
});
