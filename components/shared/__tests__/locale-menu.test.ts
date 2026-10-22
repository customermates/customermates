import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({ useLocale: () => "en", useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/navigation-guard.context", () => ({ useNavigationGuard: () => null }));
const route = vi.hoisted(() => ({ pathname: "/pricing" }));

vi.mock("@/i18n/navigation", () => ({ usePathname: () => route.pathname }));

import { LocaleMenu } from "../locale-menu";

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

  it("offers a partial marketing locale only on the pages it publishes", () => {
    route.pathname = "/pricing";
    expect(markup("cloud")).toContain('hrefLang="fr"');

    route.pathname = "/blog";
    const blog = markup("cloud");
    expect(blog).not.toContain('hrefLang="fr"');
    expect(blog).toContain('hrefLang="de"');
    route.pathname = "/pricing";
  });
});
