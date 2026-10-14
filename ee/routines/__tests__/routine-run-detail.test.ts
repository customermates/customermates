import { describe, expect, it } from "vitest";

import { IntlMessageFormat } from "intl-messageformat";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { RoutineRunStatus } from "@/generated/prisma";
import { AGENT_TURN_STOP_REASONS } from "@/ee/agent-chat/agent-turn-request";
import {
  ROUTINE_RUN_ERROR_CODES,
  ROUTINE_RUN_REASONS,
  routineRunDetail,
  routineRunStopReason,
} from "@/ee/routines/routine-run-outcome";
import { DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN } from "@/ee/routines/routine-run-limits";
import en from "@/i18n/locales/en.json";
import de from "@/i18n/locales/de.json";

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

  it("shows a provider context failure ahead of a truncated partial summary", () => {
    expect(
      routineRunDetail(
        {
          status: RoutineRunStatus.partial,
          summary: "Earlier progress that fills the summary.",
          error: null,
          stopReason: "context_limit",
        },
        t,
      ),
    ).toBe("RoutineRunStopReason.contextLimit");
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

  it("explains a blocked run when hosted AI is unavailable", () => {
    expect(
      routineRunDetail({ status: RoutineRunStatus.blocked, summary: null, error: "agentServiceUnavailable" }, t),
    ).toBe("Common.errors.agentServiceUnavailable");
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
      "RoutineRunStopReason.runCreditLimit",
      "RoutineRunStopReason.providerError",
      "RoutineRunStopReason.contentFilter",
      "RoutineRunStopReason.hostedAiUnavailable",
      "RoutineRunStopReason.cancelled",
      "RoutineRunStopReason.turnError",
      "RoutineRunStopReason.contextLimit",
      "RoutineRunStopReason.policyBreach",
    ];

    expect(AGENT_TURN_STOP_REASONS.map((stopReason) => routineRunStopReason({ stopReason }, t))).toEqual(expectedKeys);
    expect(routineRunStopReason({ stopReason: null }, t)).toBe("");
  });

  it("names the routine's per-run limit, not the owner's period credits, in English and German", () => {
    const render = (catalog: { RoutineRunStopReason: Record<string, string> }, locale: string) =>
      routineRunStopReason({ stopReason: "run_credit_limit" }, (key, values) =>
        String(
          new IntlMessageFormat(catalog.RoutineRunStopReason[key.replace("RoutineRunStopReason.", "")], locale).format(
            values,
          ),
        ),
      );

    expect(render(en, "en")).toBe(
      `The run stopped at its limit of ${DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN} credits per run.`,
    );
    expect(render(de, "de")).toBe(
      `Der Lauf wurde an seiner Obergrenze von ${DEFAULT_ROUTINE_MAX_CREDITS_PER_RUN} Credits pro Lauf beendet.`,
    );
    expect(render(en, "en")).not.toBe(en.RoutineRunStopReason.creditLimit);
    expect(`${render(en, "en")} ${render(de, "de")}`).not.toMatch(/Assistant|Assistenten|period|Periode|Guthaben/i);
  });
});
