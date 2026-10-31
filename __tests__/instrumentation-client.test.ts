import { afterEach, describe, expect, it, vi } from "vitest";
const capture = vi.hoisted(() => vi.fn());
vi.mock("@/core/observability/browser", () => ({ captureException: capture }));
afterEach(() => {
  capture.mockClear();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});
async function instrumentation(pathname = "/en/pricing") {
  const listeners = new Map<string, (event: unknown) => void>();
  vi.stubGlobal("window", {
    location: { pathname },
    addEventListener: (type: string, callback: (event: unknown) => void) => listeners.set(type, callback),
  });
  await import("../instrumentation-client");
  return listeners;
}
describe("native client instrumentation", () => {
  it("captures early marketing and app errors without an idle SDK load", async () => {
    const listeners = await instrumentation();
    const error = new Error("failed");
    listeners.get("error")?.({ error });
    expect(capture).toHaveBeenCalledWith(error, { frames: undefined });
    const rejected = new Error("rejected");
    listeners.get("unhandledrejection")?.({ reason: rejected });
    expect(capture).toHaveBeenCalledWith(rejected);
  });
  it("preserves browser coordinates when there is no Error object", async () => {
    const listeners = await instrumentation();
    listeners.get("error")?.({
      message: "failed",
      filename: "https://app.test/_next/static/chunk.js",
      lineno: 2,
      colno: 9,
    });
    expect(capture).toHaveBeenCalledWith("failed", {
      frames: [{ file: "https://app.test/_next/static/chunk.js", line: 2, column: 9 }],
    });
  });
  it("registers no handlers when reporting is off", async () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "off");
    expect(await instrumentation()).toHaveLength(0);
  });
});
