import { afterEach, describe, expect, it, vi } from "vitest";

import { ERROR_NOTIFICATION_FAILURE_PREFIX, errorFrames, errorReport } from "../error-report";
import { errorReportingEnabled } from "@/core/errors/reporting-provider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("native error normalization", () => {
  it("reports from an HTTP browser where randomUUID is unavailable", () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "build-1");
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(1) });
    expect(errorReport(new Error("fixture"), "browser")?.id).toBe("01".repeat(16));
  });
  it("defaults to native reporting and rejects invalid configuration", () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "");
    expect(errorReportingEnabled()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "off");
    expect(errorReportingEnabled()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_PROVIDER", "vercle");
    expect(errorReportingEnabled).toThrow("off or vercel");
  });

  it("keeps compiled V8 and Firefox coordinates without query strings or credentials", () => {
    const frames = errorFrames(
      "Error: failed\n    at throwHere (https://person:password@app.test/_next/chunk.js?token=private:1:9)\ncaller@https://app.test/_next/other.js:3:12",
    );
    expect(frames).toEqual([
      { file: "https://app.test/_next/other.js", function: "caller", line: 3, column: 12 },
      { file: "https://app.test/_next/chunk.js", function: "throwHere", line: 1, column: 9 },
    ]);
  });

  it("includes bounded context and causes without arbitrary extras or browser identity", () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "build-1");
    const cause = new Error("failed password=secret person@example.com");
    const error = new Error("failed https://app.test/en/invitation/private?token=secret", { cause });
    cause.stack = "Error: failed password=secret person@example.com\n at fail (/app/.next/server/cause.js:2:4)";
    error.stack = "Error: wrapped failure\n at wrapper (/app/.next/server/outer.js:3:4)";
    const context = {
      user: { id: "user-1" },
      tags: { companyId: "company-1", kind: "cleanup-failure" },
      contexts: { workflow: { workflowName: "synthetic" } },
      path: "/en/invitation/private?token=secret",
      extra: { password: "secret" },
    };
    const report = errorReport(error, "server", context);
    expect(report).toMatchObject({
      buildId: "build-1",
      path: "/en/invitation/[redacted]",
      tenant: { userId: "user-1", companyId: "company-1" },
      workflowName: "synthetic",
      tags: { kind: "cleanup-failure" },
    });
    expect(report?.causes).toHaveLength(1);
    expect(JSON.stringify(report)).not.toMatch(/private|secret|person@example/);
    expect(errorReport(error, "browser", context)?.tenant).toBeUndefined();
  });

  it("bounds cyclic causes and excludes reporting failures even when wrapped", () => {
    vi.stubEnv("NEXT_PUBLIC_ERROR_REPORTING_BUILD_ID", "build-1");
    const error = new Error("failed");
    error.cause = error;
    expect(errorReport(error, "server")?.causes).toBeUndefined();
    const failure = new Error(`${ERROR_NOTIFICATION_FAILURE_PREFIX} delivery failed`);
    expect(errorReport(new Error("wrapped", { cause: failure }), "server")).toBeNull();
  });
});
