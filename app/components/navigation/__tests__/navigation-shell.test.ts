import { describe, expect, it } from "vitest";

import { ACCOUNT_STATES } from "@/features/auth/account-state";

import { resolveNavigationShell } from "../navigation-shell";

describe("resolveNavigationShell", () => {
  it.each(ACCOUNT_STATES)("keeps docs public for %s", (state) => {
    expect(
      resolveNavigationShell({
        accountState: state,
        pathname: "/docs/api",
        isRegistered: true,
      }),
    ).toBe("docs");
  });

  it.each(["overdueVerification", "inactive", "pending", "onboarding", "legal", "subscription"] as const)(
    "uses the restricted shell for %s on state and mismatched app routes",
    (state) => {
      expect(
        resolveNavigationShell({
          accountState: state,
          pathname: "/dashboard",
          isRegistered: true,
        }),
      ).toBe("restricted");
      expect(
        resolveNavigationShell({
          accountState: state,
          pathname: "/auth/error",
          isRegistered: true,
        }),
      ).toBe("restricted");
    },
  );

  it("keeps unauthenticated and pre-tenant sessions on the public shell", () => {
    expect(
      resolveNavigationShell({
        accountState: "unauthenticated",
        pathname: "/auth/signin",
        isRegistered: false,
      }),
    ).toBe("public");
    expect(
      resolveNavigationShell({
        accountState: "unregistered",
        pathname: "/onboarding/wizard",
        isRegistered: false,
      }),
    ).toBe("public");
  });

  it.each(["/auth/verify-email", "/pricing", "/terms"])(
    "keeps an overdue pre-tenant session on the public shell at %s with a sign-out escape",
    (pathname) => {
      expect(
        resolveNavigationShell({
          accountState: "overdueVerification",
          pathname,
          isRegistered: false,
        }),
      ).toBe("public");
    },
  );

  it("never mounts the tenant shell for a pre-tenant session", () => {
    expect(
      resolveNavigationShell({
        accountState: "unregistered",
        pathname: "/dashboard",
        isRegistered: false,
      }),
    ).toBe("public");
  });

  it("uses public chrome for an allowed account visiting auth or onboarding routes", () => {
    expect(
      resolveNavigationShell({
        accountState: "allowed",
        pathname: "/auth/signin",
        isRegistered: true,
      }),
    ).toBe("public");
    expect(
      resolveNavigationShell({
        accountState: "allowed",
        pathname: "/onboarding/wizard/profile",
        isRegistered: true,
      }),
    ).toBe("public");
  });

  it("uses the full app shell only for an allowed app route", () => {
    expect(
      resolveNavigationShell({
        accountState: "allowed",
        pathname: "/dashboard",
        isRegistered: true,
      }),
    ).toBe("app");
  });
});
