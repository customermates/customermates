import { describe, expect, it } from "vitest";

import { resolvePublicNavbarActions } from "../public-navbar-model";

describe("resolvePublicNavbarActions", () => {
  it("offers sign-in and contact without a session", () => {
    expect(
      resolvePublicNavbarActions({
        accountState: "unauthenticated",
        hasValidSession: false,
        pathname: "/pricing",
      }),
    ).toEqual({
      cta: { href: "/auth/signin", label: "signIn" },
      showContact: true,
      signOut: "hidden",
    });
  });

  it("does not duplicate the sign-in action on the sign-in page", () => {
    expect(
      resolvePublicNavbarActions({
        accountState: "unauthenticated",
        hasValidSession: false,
        pathname: "/auth/signin",
      }).cta,
    ).toBeNull();
  });

  it("focuses an unregistered public session on continuing setup", () => {
    expect(
      resolvePublicNavbarActions({
        accountState: "unregistered",
        hasValidSession: true,
        pathname: "/pricing",
      }),
    ).toEqual({
      cta: { href: "/onboarding", label: "continueSetup" },
      showContact: false,
      signOut: "hidden",
    });
  });

  it("shows the destructive setup escape only on onboarding", () => {
    expect(
      resolvePublicNavbarActions({
        accountState: "unregistered",
        hasValidSession: true,
        pathname: "/onboarding",
      }),
    ).toEqual({
      cta: null,
      showContact: false,
      signOut: "setupEscape",
    });
  });

  it("keeps the setup escape on nested onboarding routes", () => {
    expect(
      resolvePublicNavbarActions({
        accountState: "unregistered",
        hasValidSession: true,
        pathname: "/onboarding/join",
      }),
    ).toEqual({
      cta: null,
      showContact: false,
      signOut: "setupEscape",
    });
  });

  it("does not trap an overdue pre-tenant session", () => {
    expect(
      resolvePublicNavbarActions({
        accountState: "overdueVerification",
        hasValidSession: true,
        pathname: "/auth/verify-email",
      }),
    ).toEqual({
      cta: null,
      showContact: true,
      signOut: "default",
    });
  });

  it("offers the app to a fully allowed account", () => {
    expect(
      resolvePublicNavbarActions({
        accountState: "allowed",
        hasValidSession: true,
        pathname: "/auth/error",
      }),
    ).toEqual({
      cta: { href: "/dashboard", label: "openApp" },
      showContact: true,
      signOut: "default",
    });
  });

  it("does not show sign-in when a valid session is reconciled on an auth route", () => {
    expect(
      resolvePublicNavbarActions({
        accountState: "unauthenticated",
        hasValidSession: true,
        pathname: "/auth/signin",
      }),
    ).toEqual({
      cta: null,
      showContact: true,
      signOut: "default",
    });
  });
});
