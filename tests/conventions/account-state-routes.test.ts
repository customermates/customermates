import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

function source(path: string): string {
  return readFileSync(join(REPO_ROOT, path), "utf8");
}

describe("guarded account-state route contract", () => {
  it.each([
    ["app/[locale]/(public)/auth/verify-email/page.tsx", /requireAccountState\(\s*"overdueVerification"\s*\)/],
    ["app/[locale]/(public)/auth/pending/page.tsx", /requireAccountState\(\s*"pending"\s*\)/],
    ["app/[locale]/(protected)/legal-update/page.tsx", /requireAccountState\(\s*"legal"\s*\)/],
    [
      "app/[locale]/(protected)/subscription-expired/page.tsx",
      /requireAccountState\(\s*"subscription",\s*"\/company\/subscription",?\s*\)/,
    ],
    ["app/[locale]/(public)/auth/mcp-consent/page.tsx", /requireAccountState\(\s*"allowed"\s*\)/],
  ])("server-gates %s with the canonical state resolver", (path, contract) => {
    expect(source(path)).toMatch(contract);
  });

  it("allows only pre-tenant or administrator onboarding states into the wizard", () => {
    const page = source("app/[locale]/(protected)/onboarding/wizard/page.tsx");
    const actions = source("app/[locale]/(protected)/onboarding/wizard/actions.ts");

    expect(page).toContain('requireAccountState(["unregistered", "onboarding"])');
    expect(actions).toContain('requireAccountState("unregistered")');
    expect(actions).toContain("email: sessionEmail");
    expect(actions).toContain('requireAccountState("onboarding")');
  });

  it("server-canonicalizes inactive errors without breaking public invite errors", () => {
    const errorPage = source("app/[locale]/(public)/auth/error/page.tsx");

    expect(errorPage).toContain("resolveDefaultAccountState()");
    expect(errorPage).toContain('resolution.state === "inactive"');
    expect(errorPage).toContain("isCanonicalInactiveErrorType(params.type)");
    expect(errorPage).toContain("/auth/error?type=inactiveUser");
    expect(errorPage).toContain('requestedErrorKey === "inactiveUser"');
    expect(errorPage).toContain("isRestrictedAccountState(resolution.state)");
    expect(errorPage).toContain('requireAccountState("inactive")');
    expect(errorPage).toContain('? "inactiveUser"');
  });

  it("revalidates the whole blocker decision during recovery transitions", () => {
    const navigation = source("app/components/navigation/navigation-switch.tsx");

    expect(navigation).toContain("currentAccountState !== accountState");
    expect(navigation).toContain("router.refresh()");
    expect(navigation).toContain("refreshAccountStateWhenVisible");
    expect(navigation).toContain('searchParams.getAll("type")');
    expect(source("app/[locale]/(public)/auth/pending/pending-card.tsx")).toContain("window.location.reload()");
    expect(source("app/[locale]/(public)/auth/verify-email/verify-email-card.tsx")).toContain(
      "window.location.reload()",
    );
    expect(source("app/[locale]/(protected)/onboarding/wizard/actions.ts")).toContain("refresh()");
    expect(source("app/[locale]/(protected)/legal-update/actions.ts")).toContain("refresh()");
  });

  it("keeps tenant enhancements and keyboard search unmounted for restricted shells", () => {
    const layout = source("app/[locale]/(protected)/layout.tsx");
    const guardedMarkup = layout.indexOf("{protectedEnhancementsAllowed ? (");

    expect(layout).toContain("if (!protectedEnhancementsAllowed) return;");
    expect(layout.indexOf("if (!protectedEnhancementsAllowed) return;")).toBeLessThan(
      layout.indexOf('document.addEventListener("keydown"'),
    );
    expect(guardedMarkup).toBeGreaterThan(0);
    for (const component of [
      "<GlobalSearchModal />",
      "<CompanyUserModal />",
      "<CompanyInviteModal />",
      "<EntityDrawer />",
      "<ConnectedAccountModal />",
    ]) {
      expect(layout.lastIndexOf(component), component).toBeGreaterThan(guardedMarkup);
    }
  });

  it("keeps MCP consent and alternate guard policies server-authoritative", () => {
    expect(source("app/[locale]/(public)/auth/actions.ts")).toContain(
      '(await resolveDefaultAccountState()).state !== "allowed"',
    );
    const requireSource = source("features/auth/next/require.ts");
    expect(requireSource).toContain("hasAlternateAccountStatePolicy");
    expect(requireSource).toContain("getRouteGuardService().resolveAccess(options)");
  });

  it("uses the existing avatar sign-out and never duplicates it inside recovery cards", () => {
    expect(source("app/components/navigation/restricted-app-sidebar.tsx")).toContain("<NavUser");
    expect(source("app/components/navigation/restricted-app-sidebar.tsx")).toContain("signOutAction()");
    expect(source("app/[locale]/(protected)/legal-update/components/legal-update-view.tsx")).not.toContain(
      "signOutAction",
    );
    expect(
      source("app/[locale]/(protected)/subscription-expired/components/subscription-expired-view.tsx"),
    ).not.toContain("signOutAction");
  });
});
