import { describe, expect, it } from "vitest";

import {
  NOTIFICATION_UNSUBSCRIBE_DAYS,
  notificationUnsubscribeSecret,
  preferenceVersionOf,
  signNotificationUnsubscribe,
  verifyNotificationUnsubscribe,
} from "../notification-unsubscribe-token";

const USER = "00000000-0000-4000-8000-000000000010";
const COMPANY = "00000000-0000-4000-8000-000000000011";
const NOW = new Date("2026-11-17T08:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const SECRET = notificationUnsubscribeSecret("auth-secret") as string;
const CLAIMS = { userId: USER, companyId: COMPANY, kind: "ruleAlert" } as const;

function token(now = NOW) {
  return signNotificationUnsubscribe(SECRET, CLAIMS, now);
}

describe("notification unsubscribe tokens", () => {
  it("derive a purpose-bound key from the auth secret", () => {
    expect(notificationUnsubscribeSecret(" secret ")).toBe("notification-unsubscribe:v1:secret");
    expect(notificationUnsubscribeSecret("  ")).toBeNull();
    expect(notificationUnsubscribeSecret(undefined)).toBeNull();
  });

  it("verify with the user, workspace and kind they were signed for", () => {
    expect(verifyNotificationUnsubscribe(SECRET, token(), NOW)).toEqual({
      status: "valid",
      ...CLAIMS,
      preferenceVersion: 0,
    });
  });

  it("carry the time of the member's last change of that kind, which cannot be altered", () => {
    const version = Date.parse("2026-11-10T07:00:00.123Z");
    const signed = signNotificationUnsubscribe(SECRET, { ...CLAIMS, preferenceVersion: version }, NOW);
    const parts = signed.split(".");

    expect(verifyNotificationUnsubscribe(SECRET, signed, NOW)).toEqual({
      status: "valid",
      ...CLAIMS,
      preferenceVersion: version,
    });
    expect(preferenceVersionOf(new Date(version))).toBe(version);
    expect(preferenceVersionOf(null)).toBe(0);
    for (const forged of ["0", String(version + 1), `0${version}`]) {
      const changed = parts.map((part, index) => (index === 4 ? forged : part)).join(".");
      expect(verifyNotificationUnsubscribe(SECRET, changed, NOW)).toEqual({ status: "invalid" });
    }
  });

  it("are valid for thirty days and expired from the thirtieth day on", () => {
    expect(NOTIFICATION_UNSUBSCRIBE_DAYS).toBe(30);
    const signed = token();
    expect(verifyNotificationUnsubscribe(SECRET, signed, new Date(NOW.getTime() + 30 * DAY_MS - 1000)).status).toBe(
      "valid",
    );
    expect(verifyNotificationUnsubscribe(SECRET, signed, new Date(NOW.getTime() + 30 * DAY_MS)).status).toBe("expired");
  });

  it("refuse a token signed with another secret", () => {
    const other = notificationUnsubscribeSecret("other-secret") as string;
    expect(verifyNotificationUnsubscribe(other, token(), NOW)).toEqual({ status: "invalid" });
  });

  it("refuse a token whose user, workspace, kind or expiry was changed", () => {
    const parts = token().split(".");
    const [expiresAt, userId, companyId, kind, , signature] = parts;
    const swap = (index: number, value: string) => parts.map((part, i) => (i === index ? value : part)).join(".");

    expect(verifyNotificationUnsubscribe(SECRET, swap(1, COMPANY), NOW).status).toBe("invalid");
    expect(verifyNotificationUnsubscribe(SECRET, swap(2, USER), NOW).status).toBe("invalid");
    expect(verifyNotificationUnsubscribe(SECRET, swap(3, "dueToday"), NOW).status).toBe("invalid");
    expect(verifyNotificationUnsubscribe(SECRET, swap(0, String(Number(expiresAt) + 86400)), NOW).status).toBe(
      "invalid",
    );
    expect(verifyNotificationUnsubscribe(SECRET, swap(5, "0".repeat(64)), NOW).status).toBe("invalid");
    expect([userId, companyId, kind, signature].every(Boolean)).toBe(true);
  });

  it("refuse a kind nothing produces even when it is signed", () => {
    const expiresAt = String(Math.floor((NOW.getTime() + DAY_MS) / 1000));
    const forged = [expiresAt, USER, COMPANY, "everything", "0", "0".repeat(64)].join(".");
    expect(verifyNotificationUnsubscribe(SECRET, forged, NOW)).toEqual({ status: "invalid" });
  });

  it("refuse malformed tokens", () => {
    for (const malformed of ["", "abc", `${token()}.x`, token().toUpperCase(), "x".repeat(300)])
      expect(verifyNotificationUnsubscribe(SECRET, malformed, NOW)).toEqual({ status: "invalid" });
  });
});
