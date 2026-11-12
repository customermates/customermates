import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/navigation-guard.context", () => ({ useNavigationGuard: () => null }));
const route = vi.hoisted(() => ({ pathname: "/pricing" }));

vi.mock("@/i18n/navigation", () => ({ usePathname: () => route.pathname }));

import { LocaleMenu } from "../locale-menu";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

function markup(appMode: "cloud" | "self-hosted") {
  return renderToStaticMarkup(createElement(LocaleMenu, { appMode }));
}

describe("LocaleMenu", () => {
  it("shows emoji flags instead of loading them from flagcdn.com on a self-hosted instance", () => {
    const html = markup("self-hosted");

    expect(html).not.toContain("flagcdn.com");
    expect(html).toContain("\u{1F1E9}\u{1F1EA}");
    expect(html).toContain("\u{1F1FA}\u{1F1F8}");
  });

  it("keeps the lazy flag images on cloud", () => {
    expect(markup("cloud")).toContain('src="https://flagcdn.com/de.svg"');
  });

  it("offers every content locale on every content page and never an unregistered one", () => {
    for (const pathname of ["/pricing", "/blog"]) {
      route.pathname = pathname;
      const html = markup("cloud");
      for (const locale of CONTENT_LOCALES) expect(html, `${pathname} ${locale}`).toContain(`hrefLang="${locale}"`);
      expect(html, pathname).not.toContain('hrefLang="ja"');
    }
    route.pathname = "/pricing";
  });
});
