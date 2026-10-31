import { afterEach, describe, expect, it, vi } from "vitest";
const capture = vi.hoisted(() => vi.fn());
vi.mock("@/core/observability/browser", () => ({ captureException: capture }));
afterEach(() => {
  capture.mockClear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
describe("captureError", () => {
  it("forwards explicit client errors to native capture", async () => {
    vi.stubGlobal("window", {});
    const { captureError } = await import("../client-reporter");
    const error = new Error("render failed");
    captureError(error);
    await vi.waitFor(() => expect(capture).toHaveBeenCalledExactlyOnceWith(error));
  });
  it("does not load reporting when explicitly off", async () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "off");
    vi.stubGlobal("window", {});
    const { captureError } = await import("../client-reporter");
    captureError(new Error("failed"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(capture).not.toHaveBeenCalled();
  });
});
