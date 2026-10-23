import { describe, expect, it } from "vitest";

import type { PublicNavLink } from "../public-navbar-menu";
import type { useTranslations } from "next-intl";

import { resolvePublicNavbarActions, resolvePublicNavGroups } from "../public-navbar-model";

const translate = ((key: string) => key) as unknown as ReturnType<typeof useTranslations>;

function visualOf(link: PublicNavLink): unknown {
  return link.icon ?? `${link.mark?.kind}:${link.mark?.provider}`;
}

describe("resolvePublicNavbarActions", () => {
  it.each([
    {
      accountState: "unauthenticated" as const,
      hasValidSession: false,
      pathname: "/auth/signup",
      target: "/auth/signin",
    },
    {
      accountState: "unregistered" as const,
      hasValidSession: true,
      pathname: "/auth/invitation",
      target: "/onboarding",
    },
  ])("preserves onboarding intent from $pathname", ({ target, ...context }) => {
    expect(resolvePublicNavbarActions({ ...context, onboardingIntent: "signed+intent" }).cta?.href).toBe(
      `${target}?intent=signed%2Bintent`,
    );
  });

  it("does not attach onboarding intent to the dashboard", () => {
    expect(
      resolvePublicNavbarActions({
        accountState: "allowed",
        hasValidSession: true,
        onboardingIntent: "signed.intent",
        pathname: "/auth/invitation",
      }).cta?.href,
    ).toBe("/dashboard");
  });

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

describe("resolvePublicNavGroups", () => {
  const groups = resolvePublicNavGroups(translate, "en");

  it("gives every destination of a menu its own icon", () => {
    for (const group of groups) {
      const visuals = group.links.map(visualOf);
      expect(new Set(visuals).size, group.id).toBe(visuals.length);
    }
  });

  it("previews each solution with a summary and its example workspace, and ends both columns with a footer link", () => {
    const solutions = groups.find((group) => group.id === "solutions");
    if (!solutions) throw new Error("solutions menu missing");

    const previewed = solutions.links.filter((link) => link.preview);
    expect(previewed.length).toBeGreaterThan(0);
    for (const link of previewed) {
      expect(link.preview?.description).toMatch(/^NavigationBar\.public\.solutionSummaries\./u);
      expect(link.preview?.exampleHref).toMatch(/^https:\/\/demo\.customermates\.com\/en\/w\/[^/]+\/dashboard$/u);
      expect(link.preview?.exampleLabel).toBe("NavigationBar.public.openExampleWorkspace");
    }

    expect(solutions.links.filter((link) => link.footer).map((link) => [link.section, link.href])).toEqual([
      ["team", "/for/professional-services"],
      ["workflow", "/for"],
    ]);
  });
});
