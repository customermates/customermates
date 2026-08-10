import { describe, expect, it } from "vitest";

import { PROTECTED_ROUTE_REGISTRY, getProtectedRouteSpec } from "../route-registry";

describe("protected route skeleton registry", () => {
  it("registers the complete protected product surface", () => {
    expect(Object.keys(PROTECTED_ROUTE_REGISTRY)).toHaveLength(25);
  });

  it("uses honest route-navigation archetypes", () => {
    expect(getProtectedRouteSpec("/contacts").skeleton).toEqual({ kind: "data-view", view: "table" });
    expect(getProtectedRouteSpec("/contacts/[id]").skeleton).toEqual({ kind: "detail" });
    expect(getProtectedRouteSpec("/dashboard").skeleton).toEqual({ kind: "dashboard" });
    expect(getProtectedRouteSpec("/inbox").skeleton).toEqual({ kind: "inbox" });
    expect(getProtectedRouteSpec("/profile/settings").skeleton).toEqual({ kind: "settings" });
  });

  it("does not fabricate true-empty states for detail, settings, or guarded flows", () => {
    for (const route of [
      "/contacts/[id]",
      "/company/settings",
      "/profile/settings",
      "/legal-update",
      "/onboarding/wizard",
      "/subscription-expired",
    ] as const)
      expect(getProtectedRouteSpec(route).trueEmpty).toBe(false);
  });
});
