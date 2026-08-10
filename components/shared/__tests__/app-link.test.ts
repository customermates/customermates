import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const localeState = vi.hoisted(() => ({ current: "en" }));

vi.mock("next-intl", () => ({
  useLocale: () => localeState.current,
}));

vi.mock("@/i18n/navigation", async () => {
  const { createElement } = await import("react");

  return {
    IntlLink: ({ children, href }: { children?: React.ReactNode; href: string }) =>
      createElement("span", { "data-href": href, "data-intl-link": "true" }, children),
  };
});

import { AppLink, contentHrefForLocale } from "../app-link";

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
    localeState.current = "it";
    const hardNavigation = renderToStaticMarkup(
      createElement(AppLink, { href: "/docs?tab=api#oauth", prefetch: true }, "Docs"),
    );
    expect(hardNavigation).toContain('<a class="');
    expect(hardNavigation).toContain('href="/en/docs?tab=api#oauth"');
    expect(hardNavigation).not.toContain("data-intl-link");
    expect(hardNavigation).not.toContain("prefetch");

    localeState.current = "de";
    const clientNavigation = renderToStaticMarkup(createElement(AppLink, { href: "/docs" }, "Docs"));
    expect(clientNavigation).toContain('data-intl-link="true"');
    expect(clientNavigation).toContain('data-href="/docs"');
  });
});
