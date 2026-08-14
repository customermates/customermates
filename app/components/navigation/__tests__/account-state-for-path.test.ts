import { describe, expect, it } from "vitest";

import { accountStateForPath } from "../account-state-for-path";
import { isCanonicalInactiveErrorType } from "@/features/auth/account-state";

describe("accountStateForPath", () => {
  it.each([
    ["inactiveUser", true],
    [["inactiveUser"], true],
    [undefined, false],
    [[], false],
    [["inactiveUser", "invalidInviteLink"], false],
    ["invalidInviteLink", false],
  ] as const)("recognizes only the canonical inactive query %#", (type, expected) => {
    expect(isCanonicalInactiveErrorType(type)).toBe(expected);
  });

  it.each([
    ["/auth/verify-email", "overdueVerification"],
    ["/auth/pending", "pending"],
    ["/onboarding/wizard", "onboarding"],
    ["/legal-update", "legal"],
    ["/subscription-expired", "subscription"],
  ] as const)("fails closed on a stale allowed shell navigating to %s", (pathname, state) => {
    expect(
      accountStateForPath({
        accountState: "allowed",
        pathname,
        isRegistered: true,
        isInactiveError: false,
      }),
    ).toBe(state);
  });

  it("fails closed only for the canonical inactive error", () => {
    expect(
      accountStateForPath({
        accountState: "allowed",
        pathname: "/auth/error",
        isRegistered: true,
        isInactiveError: true,
      }),
    ).toBe("inactive");
    expect(
      accountStateForPath({
        accountState: "allowed",
        pathname: "/auth/error",
        isRegistered: true,
        isInactiveError: false,
      }),
    ).toBe("allowed");
  });

  it.each(["/auth/signin", "/auth/signup", "/auth/forgot-password", "/auth/reset-password"])(
    "invalidates a stale registered session when %s commits",
    (pathname) => {
      expect(
        accountStateForPath({
          accountState: "allowed",
          pathname,
          isRegistered: true,
          isInactiveError: false,
        }),
      ).toBe("unauthenticated");
    },
  );

  it("preserves a valid pre-tenant session on unauthenticated routes", () => {
    expect(
      accountStateForPath({
        accountState: "unregistered",
        pathname: "/auth/signin",
        isRegistered: false,
        isInactiveError: false,
      }),
    ).toBe("unregistered");
  });

  it("invalidates a stale pre-tenant root when the verification grace period expires", () => {
    expect(
      accountStateForPath({
        accountState: "unregistered",
        pathname: "/auth/verify-email",
        isRegistered: false,
        isInactiveError: false,
      }),
    ).toBe("overdueVerification");
  });

  it("does not reinterpret a truly unauthenticated verification visit", () => {
    expect(
      accountStateForPath({
        accountState: "unauthenticated",
        pathname: "/auth/verify-email",
        isRegistered: false,
        isInactiveError: false,
      }),
    ).toBe("unauthenticated");
  });

  it("does not reinterpret public invite errors as inactive accounts", () => {
    expect(
      accountStateForPath({
        accountState: "unauthenticated",
        pathname: "/auth/error",
        isRegistered: false,
        isInactiveError: false,
      }),
    ).toBe("unauthenticated");
  });

  it("preserves the canonical blocker away from a state route", () => {
    expect(
      accountStateForPath({
        accountState: "legal",
        pathname: "/dashboard",
        isRegistered: true,
        isInactiveError: false,
      }),
    ).toBe("legal");
  });
});
