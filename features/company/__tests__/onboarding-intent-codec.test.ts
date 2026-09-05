import { describe, expect, it } from "vitest";

import { hmacSha256Hex } from "@/core/utils/hmac";
import {
  decodeOnboardingIntent,
  encodeCreateCompanyOnboardingIntent,
  encodeInvitationOnboardingIntent,
  ONBOARDING_INTENT_MAX_AGE_MS,
  ONBOARDING_INTENT_VALUE_MAX_BYTES,
  onboardingIntentSigningSecret,
} from "../onboarding-intent-codec";

const now = new Date("2026-09-04T12:00:00.000Z");
const secret = "codec-test-secret";

function signedPayload(payload: unknown): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${hmacSha256Hex(secret, encoded)}`;
}

describe("onboarding intent codec", () => {
  it("round-trips an invitation and caps it at the invitation expiry", () => {
    const inviteExpiresAt = new Date(now.getTime() + 15 * 60_000);
    const encoded = encodeInvitationOnboardingIntent("invite-token", inviteExpiresAt, secret, now);

    expect(decodeOnboardingIntent(encoded ?? undefined, secret, now)).toEqual({
      payload: {
        expiresAt: inviteExpiresAt.getTime(),
        token: "invite-token",
        type: "invitation",
      },
      status: "valid",
    });
  });

  it("caps a long-lived invitation at the two-hour onboarding lifetime", () => {
    const encoded = encodeInvitationOnboardingIntent(
      "invite-token",
      new Date(now.getTime() + 7 * 24 * 60 * 60_000),
      secret,
      now,
    );

    expect(decodeOnboardingIntent(encoded ?? undefined, secret, now)).toMatchObject({
      payload: { expiresAt: now.getTime() + ONBOARDING_INTENT_MAX_AGE_MS },
      status: "valid",
    });
  });

  it("round-trips a company-creation decision bound to one identity", () => {
    const encoded = encodeCreateCompanyOnboardingIntent("auth-user-one", secret, now);

    expect(decodeOnboardingIntent(encoded ?? undefined, secret, now)).toEqual({
      payload: {
        authUserId: "auth-user-one",
        expiresAt: now.getTime() + ONBOARDING_INTENT_MAX_AGE_MS,
        type: "createCompany",
      },
      status: "valid",
    });
  });

  it("rejects tampering, malformed values, and oversized input", () => {
    const encoded = encodeCreateCompanyOnboardingIntent("auth-user-one", secret, now);
    if (!encoded) throw new Error("Expected an encoded test intent");

    expect(decodeOnboardingIntent(`${encoded}x`, secret, now)).toEqual({ status: "invalid" });
    expect(decodeOnboardingIntent("not-an-intent", secret, now)).toEqual({ status: "invalid" });
    expect(decodeOnboardingIntent("x".repeat(ONBOARDING_INTENT_VALUE_MAX_BYTES + 1), secret, now)).toEqual({
      status: "invalid",
    });
  });

  it("expires exactly at the signed expiry instant", () => {
    const expiresAt = new Date(now.getTime() + 60_000);
    const encoded = encodeInvitationOnboardingIntent("invite-token", expiresAt, secret, now);

    expect(decodeOnboardingIntent(encoded ?? undefined, secret, expiresAt)).toEqual({ status: "expired" });
  });

  it("rejects a validly signed payload beyond the maximum lifetime", () => {
    const encoded = signedPayload({
      authUserId: "auth-user-one",
      expiresAt: now.getTime() + ONBOARDING_INTENT_MAX_AGE_MS + 1,
      type: "createCompany",
    });

    expect(decodeOnboardingIntent(encoded, secret, now)).toEqual({ status: "invalid" });
  });

  it("refuses to issue an invitation that is already expired", () => {
    expect(encodeInvitationOnboardingIntent("invite-token", now, secret, now)).toBeNull();
  });

  it("derives a non-empty domain-separated secret", () => {
    expect(onboardingIntentSigningSecret("  base-secret  ")).toBe("onboarding-intent:v1:base-secret");
    expect(onboardingIntentSigningSecret(" ")).toBeNull();
  });
});
