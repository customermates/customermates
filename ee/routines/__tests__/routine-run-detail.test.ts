import { describe, expect, it } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RoutineRunStatus } from "@/generated/prisma";
import { ROUTINE_RUN_ERROR_CODES, ROUTINE_RUN_REASONS, routineRunDetail } from "@/ee/routines/routine-run-outcome";

const t = (key: string) => key;

describe("routineRunDetail", () => {
  it("prefers the summary when the run produced one", () => {
    const run = { status: RoutineRunStatus.succeeded, summary: "30", error: null };

    expect(routineRunDetail(run, t)).toBe("30");
  });

  it("translates a known skip reason rather than leaking the enum", () => {
    const run = { status: RoutineRunStatus.skipped, summary: null, error: "ownerRunLimit" };

    expect(routineRunDetail(run, t)).toBe("RoutineRunReason.ownerRunLimit");
  });

  it("translates a stored agent error code through the shared error catalog", () => {
    const run = { status: RoutineRunStatus.blocked, summary: null, error: "agentLimitReached" };

    expect(routineRunDetail(run, t)).toBe("Common.errors.agentLimitReached");
  });

  it("never shows a stored token it does not recognise", () => {
    const run = { status: RoutineRunStatus.skipped, summary: null, error: "agentDisposition:running" };

    expect(routineRunDetail(run, t)).toBe("RoutineRunReason.unknownFailure");
  });

  it("explains a failure that recorded no reason at all", () => {
    const run = { status: RoutineRunStatus.failed, summary: null, error: null };

    expect(routineRunDetail(run, t)).toBe("RoutineRunReason.unknownFailure");
  });

  it("resolves every reason and error code it is willing to store", () => {
    for (const reason of ROUTINE_RUN_REASONS) {
      expect(routineRunDetail({ status: RoutineRunStatus.skipped, summary: null, error: reason }, t)).toBe(
        `RoutineRunReason.${reason}`,
      );
    }

    for (const code of ROUTINE_RUN_ERROR_CODES) {
      expect(routineRunDetail({ status: RoutineRunStatus.blocked, summary: null, error: code }, t)).toBe(
        `Common.errors.${code}`,
      );
    }
  });

  it("keeps the error-code allowlist pointed at real CustomErrorCode values", () => {
    const known = new Set<string>(Object.values(CustomErrorCode));

    expect(ROUTINE_RUN_ERROR_CODES.filter((code) => !known.has(code))).toEqual([]);
  });
});
