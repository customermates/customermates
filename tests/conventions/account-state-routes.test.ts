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
    ["app/[locale]/(protected)/legal-update/page.tsx", /requireAccountState\(\s*\[\s*"allowed",\s*"legal"\s*\]\s*\)/],
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
    const registerInteractor = source("features/user/register/register-user.interactor.ts");
    const completeInteractor = source("features/onboarding-wizard/complete-onboarding-wizard.interactor.ts");

    expect(page).toContain('requireAccountState(["unregistered", "onboarding"])');
    expect(actions).toContain("getRegisterUserInteractor().invoke(data)");
    expect(actions).toContain("getCompleteOnboardingWizardInteractor().invoke()");
    expect(actions.match(/serializeResult\(/g)).toHaveLength(2);
    expect(actions).toContain("redirect(result.data.redirectTo)");
    expect(actions).not.toContain('redirect("/")');
    expect(actions).not.toContain("requireAccountState");
    expect(actions).not.toContain("getUserService");
    expect(actions).not.toContain("Status.");
    expect(registerInteractor).toContain('resolution.state !== "unregistered"');
    expect(registerInteractor).toContain("email: resolution.sessionUser.email");
    expect(completeInteractor).toContain('resolution.state !== "onboarding"');
    expect(completeInteractor).toContain('data: { redirectTo: "/" as const }');
  });

  it("server-canonicalizes inactive errors without breaking public invite errors", () => {
    const errorPage = source("app/[locale]/(public)/auth/error/page.tsx");

    expect(errorPage).toContain("resolveRequestAccountState()");
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
    const navigation = source("app/components/navigation/navigation-switch.tsx");
    const context = source("app/components/navigation/protected-enhancements-context.tsx");
    const guardedMarkup = layout.indexOf("{protectedEnhancementsAllowed ? (");

    expect(navigation).toContain("<ProtectedEnhancementsProvider allowed={protectedEnhancementsAllowed}>");
    expect(context).toContain("createContext<boolean | null>(null)");
    expect(context).not.toContain("AccountState");
    expect(layout).toContain("useProtectedEnhancementsAllowed()");
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

  it("keeps mutation policy in interactors and page guards server-authoritative", () => {
    const authActions = source("app/[locale]/(public)/auth/actions.ts");
    const consentInteractor = source("features/auth/decide-mcp-consent.interactor.ts");

    expect(authActions).toContain("getDecideMcpConsentInteractor().invoke(data)");
    expect(authActions).toContain("serializeResult(getDecideMcpConsentInteractor().invoke(data))");
    expect(authActions).not.toContain("resolveRequestAccountState");
    expect(authActions).not.toContain("getAuthService");
    expect(consentInteractor).toContain('resolution.state !== "allowed"');
    const requireSource = source("features/auth/next/require.ts");
    expect(requireSource).toMatch(
      /accessRedirectForAccountState\(\s*await resolveRequestAccountState\(\),\s*options,?\s*\)/,
    );
    expect(requireSource).not.toContain("getRouteGuardService");
    expect(requireSource).not.toContain("skipLegalAcceptanceCheck");
  });

  it("uses the existing avatar sign-out and never duplicates it inside recovery cards", () => {
    const sidebar = source("app/components/app-sidebar.tsx");
    expect(sidebar).toContain("<NavUser");
    expect(sidebar).toContain("signOutAction()");
    expect(sidebar).toContain("if (!restricted) runUserAction(() => userStore.updateTheme(next))");
    expect(source("app/[locale]/(protected)/legal-update/components/legal-update-view.tsx")).not.toContain(
      "signOutAction",
    );
    expect(
      source("app/[locale]/(protected)/subscription-expired/components/subscription-expired-view.tsx"),
    ).not.toContain("signOutAction");
  });
});
