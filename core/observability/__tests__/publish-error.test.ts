import { afterEach, describe, expect, it, vi } from "vitest";

import { errorFingerprint, publishServerError } from "../publish-error";
import type { ErrorReport } from "../error-report";

function report(overrides: Partial<ErrorReport> = {}): ErrorReport {
  return {
    kind: "application-error",
    id: "event-fixture",
    buildId: "build-fixture",
    timestamp: 1,
    level: "error",
    source: "server",
    name: "TypeError",
    message: "Record 0f8fad5b-d9cb-469f-a165-70867728950e failed after 22785 ms",
    frames: [
      { file: "/app/node_modules/pkg/index.js", function: "inner", line: 1 },
      { file: "/app/features/records/service.ts", function: "load", line: 10 },
      { file: "/app/node_modules/next/server.js", function: "handle", line: 2 },
    ],
    ...overrides,
  };
}

afterEach(() => vi.restoreAllMocks());

describe("errorFingerprint", () => {
  it("ignores IDs, numbers and line numbers but separates errors and code locations", () => {
    const base = errorFingerprint(report());
    expect(
      errorFingerprint(
        report({
          message: "Record 7c9e6679-7425-40de-944b-e07fc1f90ae7 failed after 501 ms",
          frames: [{ file: "/app/features/records/service.ts", function: "load", line: 99 }],
        }),
      ),
    ).toBe(base);
    expect(errorFingerprint(report({ name: "RangeError" }))).not.toBe(base);
    expect(errorFingerprint(report({ frames: [{ file: "/app/features/other.ts", function: "load" }] }))).not.toBe(base);
  });
});

describe("publishServerError", () => {
  it("writes one structured log line with the fingerprint", () => {
    const lines: string[] = [];
    vi.spyOn(console, "info").mockImplementation((line) => lines.push(String(line)));
    publishServerError(report());
    expect(lines.map((line) => JSON.parse(line))).toEqual([{ ...report(), fingerprint: errorFingerprint(report()) }]);
  });
});
