import { describe, expect, it } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RoutineRunStatus } from "@/generated/prisma";
import { AGENT_TURN_STOP_REASONS } from "@/ee/agent-chat/agent-turn-request";
import {
  ROUTINE_RUN_ERROR_CODES,
  ROUTINE_RUN_REASONS,
  routineRunDetail,
  routineRunStopReason,
} from "@/ee/routines/routine-run-outcome";

const t = (key: string) => key;

describe("routineRunDetail", () => {
  it("prefers the summary when the run produced one", () => {
    const run = {
      status: RoutineRunStatus.succeeded,
      summary: "30",
      error: null,
    };

    expect(routineRunDetail(run, t)).toBe("30");
  });

  it("translates a known skip reason rather than leaking the enum", () => {
    const run = {
      status: RoutineRunStatus.skipped,
      summary: null,
      error: "hourlyRunLimit",
    };

    expect(routineRunDetail(run, t)).toBe("RoutineRunReason.hourlyRunLimit");
  });

  it("translates a stored agent error code through the shared error catalog", () => {
    const run = {
      status: RoutineRunStatus.blocked,
      summary: null,
      error: "agentLimitReached",
    };

    expect(routineRunDetail(run, t)).toBe("Common.errors.agentLimitReached");
  });

  it("never shows a stored token it does not recognise", () => {
    const run = {
      status: RoutineRunStatus.skipped,
      summary: null,
      error: "agentDisposition:running",
    };

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

  it("translates every typed terminal stop reason without exposing its stored token", () => {
    const expectedKeys = [
      "RoutineRunStopReason.creditLimit",
      "RoutineRunStopReason.providerError",
      "RoutineRunStopReason.contentFilter",
      "RoutineRunStopReason.hostedAiUnavailable",
      "RoutineRunStopReason.cancelled",
      "RoutineRunStopReason.turnError",
      "RoutineRunStopReason.policyBreach",
    ];

    expect(AGENT_TURN_STOP_REASONS.map((stopReason) => routineRunStopReason({ stopReason }, t))).toEqual(expectedKeys);
    expect(routineRunStopReason({ stopReason: null }, t)).toBe("");
  });
});
