import { describe, expect, it } from "vitest";

import { CONSENT_COOKIE_NAME, consentCookie, parseConsentState } from "../consent";

const state = {
  advertising: false,
  analytics: true,
  decidedAt: "2026-08-26T10:00:00.000Z",
  version: 1,
} as const;

describe("consent state", () => {
  it("round-trips the versioned preference", () => {
    const serialized = consentCookie(state, true);
    const value = serialized.split(";")[0].slice(`${CONSENT_COOKIE_NAME}=`.length);

    expect(parseConsentState(value)).toEqual(state);
    expect(serialized).toContain("SameSite=Lax");
    expect(serialized).toContain("Secure");
  });

  it("fails closed for absent, malformed, or stale consent", () => {
    expect(parseConsentState(null)).toBeNull();
    expect(parseConsentState("not-json")).toBeNull();
    expect(parseConsentState(encodeURIComponent(JSON.stringify({ ...state, version: 2 })))).toBeNull();
    expect(parseConsentState(encodeURIComponent(JSON.stringify({ ...state, advertising: true })))).toBeNull();
  });
});
