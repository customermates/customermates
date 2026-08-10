import { describe, expect, it } from "vitest";

import { resolvePublicNavbarCta } from "../public-navbar-model";

describe("resolvePublicNavbarCta", () => {
  it("offers sign-in without a session", () => {
    expect(
      resolvePublicNavbarCta({
        accountState: "unauthenticated",
        hasValidSession: false,
        isRegistered: false,
        onboardingComplete: false,
      }),
    ).toEqual({ href: "/auth/signin", label: "signIn" });
  });

  it("offers setup to an unregistered session", () => {
    expect(
      resolvePublicNavbarCta({
        accountState: "unregistered",
        hasValidSession: true,
        isRegistered: false,
        onboardingComplete: false,
      }),
    ).toEqual({ href: "/onboarding/wizard", label: "continueSetup" });
  });

  it("does not offer a looping setup CTA to an overdue pre-tenant session", () => {
    expect(
      resolvePublicNavbarCta({
        accountState: "overdueVerification",
        hasValidSession: true,
        isRegistered: false,
        onboardingComplete: false,
      }),
    ).toBeNull();
  });

  it("offers the app to a fully allowed account", () => {
    expect(
      resolvePublicNavbarCta({
        accountState: "allowed",
        hasValidSession: true,
        isRegistered: true,
        onboardingComplete: true,
      }),
    ).toEqual({ href: "/dashboard", label: "openApp" });
  });
});
