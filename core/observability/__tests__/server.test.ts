import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("native server severity", () => {
  it("logs informational, scoped warning and error reports as structured lines", async () => {
    vi.resetModules();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "build-fixture");
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "vercel");
    const logs: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line) => logs.push(String(line)));
    const reporter = await import("../server");
    reporter.captureMessage("informational fixture");
    reporter.withScope((scope) => {
      scope.setLevel("warning");
      reporter.captureMessage("warning fixture");
    });
    reporter.captureMessage("error fixture", { level: "error" });
    const reports = logs.map((line) => JSON.parse(line)).filter((report) => report.kind === "application-error");
    expect(reports.map((report) => [report.level, report.message])).toEqual([
      ["info", "informational fixture"],
      ["warning", "warning fixture"],
      ["error", "error fixture"],
    ]);
    expect(reports.every((report) => /^[a-f0-9]{32}$/.test(report.fingerprint))).toBe(true);
  });
});
