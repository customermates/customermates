import { describe, expect, it } from "vitest";

import { PROTECTED_ROUTE_REGISTRY, getProtectedRouteSpec } from "../route-registry";

describe("protected route skeleton registry", () => {
  it("freezes the legacy registry so new routes must own their loader directly", () => {
    expect(Object.keys(PROTECTED_ROUTE_REGISTRY).sort()).toEqual([
      "/company/audit-logs",
      "/company/members",
      "/company/roles",
      "/company/settings",
      "/company/subscription",
      "/company/webhook-deliveries",
      "/company/webhooks",
      "/contacts/[id]",
      "/dashboard",
      "/deals",
      "/deals/[id]",
      "/inbox",
      "/legal-update",
      "/onboarding/wizard",
      "/organizations",
      "/organizations/[id]",
      "/profile/api-keys",
      "/profile/connected-accounts",
      "/profile/settings",
      "/services",
      "/services/[id]",
      "/subscription-expired",
      "/tasks",
      "/tasks/[id]",
    ]);
  });

  it("uses honest route-navigation archetypes", () => {
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
