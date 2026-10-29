import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ErrorReport } from "../error-report";
import {
  claimErrorNotification,
  errorFingerprint,
  errorNotificationDailyLimit,
  resetErrorNotificationClaims,
} from "../error-notification-claim";

const day = Date.UTC(2026, 9, 29, 12) / 1000;

function report(overrides: Partial<ErrorReport> = {}): ErrorReport {
  return {
    kind: "application-error",
    id: "event-fixture",
    buildId: "build-fixture",
    timestamp: day,
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

beforeEach(() => resetErrorNotificationClaims());
afterEach(() => vi.unstubAllEnvs());

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

describe("claimErrorNotification", () => {
  it("claims only the first occurrence of an error each day", () => {
    expect(claimErrorNotification(report())).toBe(errorFingerprint(report()));
    expect(claimErrorNotification(report({ id: "second" }))).toBeNull();
    expect(claimErrorNotification(report({ timestamp: day + 86_400 }))).toBe(errorFingerprint(report()));
  });

  it("stops at the daily limit across distinct errors", () => {
    vi.stubEnv("ERROR_REPORTING_NOTIFICATION_DAILY_LIMIT", "2");
    const claims = ["A", "B", "C"].map((name) => claimErrorNotification(report({ name })));
    expect(claims.map(Boolean)).toEqual([true, true, false]);
    expect(claimErrorNotification(report({ name: "D", timestamp: day + 86_400 }))).not.toBeNull();
  });

  it("is disabled by a zero limit and defaults on invalid values", () => {
    vi.stubEnv("ERROR_REPORTING_NOTIFICATION_DAILY_LIMIT", "0");
    expect(claimErrorNotification(report())).toBeNull();
    vi.stubEnv("ERROR_REPORTING_NOTIFICATION_DAILY_LIMIT", "many");
    expect(errorNotificationDailyLimit()).toBe(10);
    vi.stubEnv("ERROR_REPORTING_NOTIFICATION_DAILY_LIMIT", "");
    expect(errorNotificationDailyLimit()).toBe(10);
  });
});
