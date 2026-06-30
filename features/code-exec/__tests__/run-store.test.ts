import type { RunCodeReport } from "../sandbox.types";

import { afterEach, describe, expect, it, vi } from "vitest";

import { completeRun, createRun, failRun, getRun } from "../run-store";

afterEach(() => {
  vi.useRealTimers();
});

const report: RunCodeReport = { status: "ok", stdout: "hi", files: [], durationMs: 5, exitCode: 0 };

describe("run-store lifecycle", () => {
  it("creates a running run, then completes it with a report", () => {
    const id = createRun({ companyId: "co", userId: "u" });
    expect(getRun(id, "co")?.status).toBe("running");
    completeRun(id, report);
    const done = getRun(id, "co");
    expect(done?.status).toBe("done");
    expect(done?.report?.stdout).toBe("hi");
  });

  it("marks a run failed", () => {
    const id = createRun({ companyId: "co", userId: "u" });
    failRun(id, "boom");
    const r = getRun(id, "co");
    expect(r?.status).toBe("error");
    expect(r?.error).toBe("boom");
  });
});

describe("run-store tenant scoping + expiry", () => {
  it("returns a run only to its own company", () => {
    const id = createRun({ companyId: "co-A", userId: "u" });
    expect(getRun(id, "co-A")).not.toBeNull();
    expect(getRun(id, "co-B")).toBeNull();
  });

  it("expires after the TTL", () => {
    vi.useFakeTimers();
    const id = createRun({ companyId: "co", userId: "u" });
    expect(getRun(id, "co")).not.toBeNull();
    vi.advanceTimersByTime(61 * 60 * 1000); // 61m > 1h TTL
    expect(getRun(id, "co")).toBeNull();
  });
});
