import { describe, expect, it } from "vitest";

import { RoutineRunStatus } from "@/generated/prisma";
import { routineRunDetail } from "@/ee/routines/routine-run-outcome";

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

  it("keeps an unrecognised error visible because it is the only diagnostic", () => {
    const run = { status: RoutineRunStatus.failed, summary: null, error: "ownerUnavailable: boom" };

    expect(routineRunDetail(run, t)).toBe("ownerUnavailable: boom");
  });

  it("explains a failure that recorded no reason at all", () => {
    const run = { status: RoutineRunStatus.failed, summary: null, error: null };

    expect(routineRunDetail(run, t)).toBe("RoutineRunReason.unknownFailure");
  });
});
