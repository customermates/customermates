import { describe, expect, it } from "vitest";

import {
  onboardingIntentAuthRedirects,
  onboardingIntentFromPath,
  pathWithOnboardingIntent,
} from "../onboarding-intent-url";

describe("onboarding intent URLs", () => {
  it("appends an encoded intent without replacing existing query parameters", () => {
    expect(pathWithOnboardingIntent("/auth/forgot-password?info=invalid", "signed/value")).toBe(
      "/auth/forgot-password?info=invalid&intent=signed%2Fvalue",
    );
  });

  it("extracts one intent from an internal callback path", () => {
    expect(onboardingIntentFromPath("/onboarding/wizard?intent=signed.intent")).toEqual({
      intent: "signed.intent",
      status: "valid",
    });
  });

  it("preserves intent across authentication and verification detours", () => {
    expect(onboardingIntentAuthRedirects("signed.intent")).toEqual({
      overdueVerification: "/auth/verify-email?intent=signed.intent",
      unauthenticated: "/auth/signin?intent=signed.intent",
    });
  });

  it("rejects duplicate intent parameters", () => {
    expect(onboardingIntentFromPath("/onboarding/wizard?intent=one&intent=two")).toEqual({ status: "invalid" });
  });

  it("ignores malformed callback paths", () => {
    expect(onboardingIntentFromPath("http://[")).toEqual({ status: "invalid" });
  });
});
