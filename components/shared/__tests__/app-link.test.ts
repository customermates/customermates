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
    expect(contentHrefForLocale("/pricing", "it")).toBe("/en/pricing");
    expect(contentHrefForLocale("/docs?tab=api#oauth", "it")).toBe("/en/docs?tab=api#oauth");
    expect(contentHrefForLocale("/fr/blog", "es")).toBe("/en/blog");
    expect(contentHrefForLocale("/de/terms", "it")).toBe("/de/terms");
    expect(contentHrefForLocale("/contact", "es")).toBe("/en/contact");
  });

  it("keeps a partial marketing locale on its published pages and falls back to the default elsewhere", () => {
    expect(contentHrefForLocale("/pricing", "fr")).toBeNull();
    expect(contentHrefForLocale("/features/pipeline", "fr")).toBeNull();
    expect(contentHrefForLocale("/fr/pricing", "es")).toBe("/fr/pricing");
    expect(contentHrefForLocale("/docs/app-records", "fr")).toBe("/en/docs/app-records");
    expect(contentHrefForLocale("/privacy", "fr")).toBe("/en/privacy");
    expect(contentHrefForLocale("/contact", "fr")).toBe("/en/contact");
    expect(contentHrefForLocale("/for/consultants", "fr")).toBe("/en/for/consultants");
    expect(contentHrefForLocale("/fr/blog", "de")).toBe("/de/blog");
  });

  it("marks a fallback link with the language it opens in", () => {
    routeState.locale = "fr";
    routeState.pathname = "/pricing";
    const fallback = renderToStaticMarkup(createElement(AppLink, { href: "/docs/app-records" }, "Fiches"));
    expect(fallback).toContain('href="/en/docs/app-records"');
    expect(fallback).toContain('hrefLang="en"');
    expect(fallback).toMatch(/<span[^>]*lang="en"[^>]*>en<\/span>/u);

    const published = renderToStaticMarkup(createElement(AppLink, { href: "/features/pipeline" }, "Pipeline"));
    expect(published).toContain('data-intl-link="true"');
    expect(published).not.toContain("hrefLang");
  });

  it("keeps content links on the client router when the current locale has content", () => {
    expect(contentHrefForLocale("/pricing", "en")).toBeNull();
    expect(contentHrefForLocale("/pricing", "de")).toBeNull();
    expect(contentHrefForLocale("/de/terms", "de")).toBeNull();
    expect(contentHrefForLocale("/en/terms", "de")).toBe("/en/terms");
  });

  it("does not rewrite app routes or external links", () => {
    expect(contentHrefForLocale("/dashboard", "fr")).toBeNull();
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
    expect(protectedHrefFromContent("/dashboard", "/settings/profile")).toBeNull();
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
