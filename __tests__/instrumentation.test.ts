import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ install: vi.fn() }));
vi.mock("@/env", () => ({ env: { NODE_ENV: "production" } }));
vi.mock("@/core/observability/server", () => ({ captureException: vi.fn() }));
vi.mock("@/core/observability/process-errors", () => ({ installProcessErrorHandlers: state.install }));

beforeEach(() => {
  state.install.mockClear();
  vi.stubEnv("NEXT_RUNTIME", "nodejs");
  vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "vercel");
});
afterEach(() => vi.unstubAllEnvs());

describe("instrumentation process ownership", () => {
  it("reports process errors on Vercel but leaves the fatal exit to its shared runtime", async () => {
    vi.stubEnv("VERCEL", "1");
    await (await import("../instrumentation")).register();
    expect(state.install).toHaveBeenCalledWith(expect.anything(), false);
  });

  it("keeps fatal error reporting for the standalone Node process", async () => {
    vi.stubEnv("VERCEL", "");
    await (await import("../instrumentation")).register();
    expect(state.install).toHaveBeenCalledWith(expect.anything(), true);
  });
});
