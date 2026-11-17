import { describe, expect, it } from "vitest";

import {
  addDaysToIso,
  dateOfIso,
  isNotificationPauseOver,
  isoDateOf,
  modesToPreferences,
  parseNotificationPause,
  pausedModes,
  rememberModes,
  restoredModes,
  serializeNotificationPause,
} from "../notification-pause";

describe("notification pause dates", () => {
  it("writes and reads the local calendar day without a time zone shift", () => {
    expect(isoDateOf(new Date(2026, 10, 17, 23, 59))).toBe("2026-11-17");
    expect(isoDateOf(dateOfIso("2026-01-05"))).toBe("2026-01-05");
    expect(addDaysToIso("2026-11-28", 7)).toBe("2026-12-05");
    expect(addDaysToIso("2026-12-30", 3)).toBe("2027-01-02");
  });

  it("ends the pause on its day, not after it", () => {
    const pause = { until: "2026-11-24", previous: {} };

    expect(isNotificationPauseOver(pause, "2026-11-23")).toBe(false);
    expect(isNotificationPauseOver(pause, "2026-11-24")).toBe(true);
    expect(isNotificationPauseOver(pause, "2026-12-01")).toBe(true);
  });
});

describe("notification pause storage", () => {
  it("round-trips the end day and the modes to bring back", () => {
    const pause = { until: "2026-11-24", previous: { dueToday: "digest", ruleAlert: "instant" } } as const;

    expect(parseNotificationPause(serializeNotificationPause(pause))).toEqual(pause);
  });

  it("reads nothing from missing, broken or foreign values", () => {
    for (const raw of [null, "", "nope", "[]", "{}", '{"until":"2026-02-30","previous":{}}', '{"until":"2026-11-24"}'])
      expect(parseNotificationPause(raw), String(raw)).toBeNull();
  });

  it("keeps only known kinds and modes", () => {
    const parsed = parseNotificationPause(
      JSON.stringify({ until: "2026-11-24", previous: { dueToday: "instant", ruleAlert: "weekly", unknown: "off" } }),
    );

    expect(parsed).toEqual({ until: "2026-11-24", previous: { dueToday: "instant" } });
  });
});

describe("pausing and resuming", () => {
  it("turns every kind off while paused", () => {
    expect(modesToPreferences(pausedModes())).toEqual([
      { kind: "dueToday", emailMode: "off" },
      { kind: "replyReceived", emailMode: "off" },
      { kind: "ruleAlert", emailMode: "off" },
    ]);
  });

  it("brings back what was remembered and the default for a kind that was not remembered", () => {
    const previous = rememberModes([
      { kind: "dueToday", emailMode: "instant" },
      { kind: "replyReceived", emailMode: "off" },
    ]);

    expect(restoredModes({ until: "2026-11-24", previous })).toEqual({
      dueToday: "instant",
      replyReceived: "off",
      ruleAlert: "instant",
    });
    expect(restoredModes({ until: "2026-11-24", previous: {} })).toEqual({
      dueToday: "digest",
      replyReceived: "digest",
      ruleAlert: "instant",
    });
  });
});
