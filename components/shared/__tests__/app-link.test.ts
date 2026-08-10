import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const routeState = vi.hoisted(() => ({ locale: "en", pathname: "/dashboard" }));

vi.mock("next-intl", () => ({
  useLocale: () => routeState.locale,
}));

vi.mock("@/i18n/navigation", async () => {
  const { createElement } = await import("react");

  return {
    IntlLink: ({ children, href }: { children?: React.ReactNode; href: string }) =>
      createElement("span", { "data-href": href, "data-intl-link": "true" }, children),
    usePathname: () => routeState.pathname,
  };
});

import { AppLink, contentHrefForLocale, protectedHrefFromContent } from "../app-link";

describe("contentHrefForLocale", () => {
  it("forces a document navigation to the default content locale from an app-only locale", () => {
    expect(contentHrefForLocale("/pricing", "fr")).toBe("/en/pricing");
    expect(contentHrefForLocale("/docs?tab=api#oauth", "it")).toBe("/en/docs?tab=api#oauth");
    expect(contentHrefForLocale("/fr/pricing", "es")).toBe("/en/pricing");
    expect(contentHrefForLocale("/de/terms", "it")).toBe("/de/terms");
  });

  it("keeps content links on the client router when the current locale has content", () => {
    expect(contentHrefForLocale("/pricing", "en")).toBeNull();
    expect(contentHrefForLocale("/pricing", "de")).toBeNull();
    expect(contentHrefForLocale("/de/terms", "de")).toBeNull();
    expect(contentHrefForLocale("/en/terms", "de")).toBe("/en/terms");
  });

  it("does not rewrite app routes or external links", () => {
    expect(contentHrefForLocale("/contact", "fr")).toBeNull();
    expect(contentHrefForLocale("https://example.com/pricing", "fr")).toBeNull();
  });

  it("renders a native anchor only when changing from an app-only locale to content", () => {
    routeState.locale = "it";
    routeState.pathname = "/dashboard";
    const hardNavigation = renderToStaticMarkup(
      createElement(AppLink, { href: "/docs?tab=api#oauth", prefetch: true }, "Docs"),
    );
    expect(hardNavigation).toContain('<a class="');
    expect(hardNavigation).toContain('href="/en/docs?tab=api#oauth"');
    expect(hardNavigation).not.toContain("data-intl-link");
    expect(hardNavigation).not.toContain("prefetch");

    routeState.locale = "de";
    const clientNavigation = renderToStaticMarkup(createElement(AppLink, { href: "/docs" }, "Docs"));
    expect(clientNavigation).toContain('data-intl-link="true"');
    expect(clientNavigation).toContain('data-href="/docs"');
  });
});

describe("protectedHrefFromContent", () => {
  it("forces a locale-less document navigation from public content into protected application routes", () => {
    expect(protectedHrefFromContent("/dashboard?tab=sales#pipeline", "/pricing")).toBe("/dashboard?tab=sales#pipeline");
    expect(protectedHrefFromContent("/de/company/settings", "/de/pricing")).toBe("/company/settings");
  });

  it("does not rewrite links from application pages, public targets, or external origins", () => {
    expect(protectedHrefFromContent("/dashboard", "/profile/settings")).toBeNull();
    expect(protectedHrefFromContent("/contact", "/pricing")).toBeNull();
    expect(protectedHrefFromContent("https://example.com/dashboard", "/pricing")).toBeNull();
  });

  it("renders a native anchor for protected links on content pages", () => {
    routeState.locale = "de";
    routeState.pathname = "/pricing";
    const hardNavigation = renderToStaticMarkup(
      createElement(AppLink, { appearance: "unstyled", href: "/dashboard?tab=sales#pipeline" }, "Dashboard"),
    );

    expect(hardNavigation).toBe('<a href="/dashboard?tab=sales#pipeline">Dashboard</a>');
  });
});
