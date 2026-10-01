import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock("workflow/api", () => ({ start: state.start }));
vi.mock("next/server", () => ({ after: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("native server severity", () => {
  it("logs informational and scoped warning messages without notification jobs", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "build-fixture");
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "vercel");
    vi.stubEnv("ERROR_REPORTING_NOTIFICATION_EMAIL", "operator@example.com");
    state.start.mockReset().mockResolvedValue({ runId: "run-fixture" });
    const logs: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line) => logs.push(String(line)));
    vi.spyOn(console, "warn").mockImplementation((line) => logs.push(String(line)));
    vi.spyOn(console, "info").mockImplementation((line) => logs.push(String(line)));
    const reporter = await import("../server");
    reporter.captureMessage("informational fixture");
    reporter.withScope((scope) => {
      scope.setLevel("warning");
      reporter.captureMessage("warning fixture");
    });
    reporter.captureMessage("error fixture", { level: "error" });
    expect(await reporter.flush()).toBe(true);
    const reports = logs.map((line) => JSON.parse(line)).filter((report) => report.kind === "application-error");
    expect(reports.map((report) => report.level)).toEqual(["info", "warning", "error"]);
    expect(state.start).toHaveBeenCalledOnce();
    expect(state.start.mock.calls[0][1][0].message).toBe("error fixture");
  });
});
