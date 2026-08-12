import { describe, expect, it } from "vitest";

import { PROTECTED_ROUTE_REGISTRY, getProtectedRouteSpec } from "../route-registry";

describe("protected route skeleton registry", () => {
  it("registers the complete protected product surface", () => {
    expect(Object.keys(PROTECTED_ROUTE_REGISTRY)).toHaveLength(25);
  });

  it("uses honest route-navigation archetypes", () => {
    expect(getProtectedRouteSpec("/contacts").skeleton).toEqual({
      kind: "data-view",
      tableVariant: "contact",
      view: "table",
    });
    expect(getProtectedRouteSpec("/contacts/[id]").skeleton).toEqual({
      kind: "detail",
    });
    expect(getProtectedRouteSpec("/dashboard").skeleton).toEqual({
      kind: "dashboard",
    });
    expect(getProtectedRouteSpec("/inbox").skeleton).toEqual({ kind: "inbox" });
    expect(getProtectedRouteSpec("/profile/settings").skeleton).toEqual({
      kind: "settings",
    });
    expect(getProtectedRouteSpec("/profile/api-keys").skeleton).toEqual({
      card: "api-keys",
      kind: "settings",
      view: "cards",
    });
    expect(getProtectedRouteSpec("/profile/connected-accounts").skeleton).toEqual({
      card: "connected-accounts",
      kind: "settings",
      view: "cards",
    });
    expect(getProtectedRouteSpec("/subscription-expired").skeleton).toEqual({
      kind: "settings",
      view: "centered-card",
      maxWidth: "3xl",
    });
  });

  it("distinguishes entity, member, and plain table geometry", () => {
    expect(getProtectedRouteSpec("/contacts").skeleton).toMatchObject({ tableVariant: "contact" });
    expect(getProtectedRouteSpec("/organizations").skeleton).toMatchObject({ tableVariant: "entity" });
    expect(getProtectedRouteSpec("/company/members").skeleton).toMatchObject({ tableVariant: "member" });
    expect(getProtectedRouteSpec("/company/audit-logs").skeleton).toMatchObject({ tableVariant: "plain" });
  });

  it("gives card settings their own route-local loading owner", () => {
    expect(getProtectedRouteSpec("/profile/api-keys").loadingOwner).toBe("/profile/api-keys");
    expect(getProtectedRouteSpec("/profile/connected-accounts").loadingOwner).toBe("/profile/connected-accounts");
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
