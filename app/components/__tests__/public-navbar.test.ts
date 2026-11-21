import type { AnchorHTMLAttributes, ReactNode } from "react";
import type * as PublicNavbarModelModule from "../navigation/public-navbar-model";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

type PublicNavbarModel = typeof PublicNavbarModelModule;

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));
vi.mock("@/i18n/navigation", () => ({ usePathname: () => "/" }));
vi.mock("@/components/shared/app-link", () => ({
  AppLink: ({
    appearance: _appearance,
    children,
    external: _external,
    onNavigate: _onNavigate,
    prefetch: _prefetch,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & {
    appearance?: string;
    children?: ReactNode;
    external?: boolean;
    onNavigate?: () => void;
    prefetch?: boolean;
  }) => createElement("a", props, children),
}));
vi.mock("@/components/shared/app-image", () => ({ AppImage: () => createElement("img") }));
vi.mock("@/components/shared/locale-menu", () => ({
  LocaleMenu: () => createElement("span", { "data-locale-menu": "" }),
}));
vi.mock("@/components/shared/theme-switcher", () => ({
  ThemeSwitcher: () => createElement("span", { "data-theme-switcher": "" }),
}));
vi.mock("../navigation/public-navbar-menu", () => ({
  isPrimaryPublicNavLink: () => false,
  PublicNavbarMenu: () => null,
}));
vi.mock("../navigation/public-navbar-account-menu", () => ({ PublicNavbarAccountMenu: () => null }));
vi.mock("../navigation/public-navbar-sign-out-button", () => ({ PublicNavbarSignOutButton: () => null }));
vi.mock("../navigation/public-navbar-model", async (importOriginal) => ({
  ...(await importOriginal<PublicNavbarModel>()),
  resolvePublicNavGroups: () => [],
}));

import { PublicNavbar } from "../public-navbar";

function render(githubStars?: number | null) {
  return renderToStaticMarkup(
    createElement(PublicNavbar, {
      accountState: "unauthenticated",
      appMode: "cloud",
      githubStars,
      hasValidSession: false,
    }),
  );
}

function desktopRight(html: string): string {
  const start = html.indexOf("justify-self-end");
  return html.slice(start, html.indexOf("xl:hidden", start));
}

describe("PublicNavbar", () => {
  it("puts the GitHub icon after language and theme, then Login and the trial, without dividers", () => {
    const right = desktopRight(render(1234));
    const order = [
      "data-locale-menu",
      "data-theme-switcher",
      "data-public-nav-github",
      "Common.actions.signIn",
      "data-public-nav-trial",
    ].map((marker) => right.indexOf(marker));

    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((left, right) => left - right)).toEqual(order);
    expect(right).toContain('aria-label="NavigationBar.public.githubStars:1234"');
    expect(right).toContain('href="https://github.com/customermates/customermates"');
    expect(right).not.toContain("data-public-nav-divider");
    expect(right).not.toContain("tabular-nums");
  });

  it("labels the GitHub icon without a count when the star count is unavailable", () => {
    const right = desktopRight(render(null));

    expect(right).toContain("data-public-nav-github");
    expect(right).toContain('aria-label="NavigationBar.public.github"');
  });
});
