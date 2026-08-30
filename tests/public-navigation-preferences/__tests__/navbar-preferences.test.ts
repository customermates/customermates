import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

const HEADER_SHELLS = {
  navbar: "app/components/public-navbar.tsx",
  docsTopBar: "app/[locale]/(static)/docs/components/docs-topbar.tsx",
} as const;

const FOOTER = "app/components/footer-content.tsx";

function read(file: string): string {
  return readFileSync(join(REPO_ROOT, file), "utf8");
}

function sourceFiles(): string[] {
  const found: string[] = [];
  const skip = new Set(["node_modules", ".next", ".git", "generated"]);

  function walk(directory: string) {
    for (const entry of readdirSync(directory)) {
      if (skip.has(entry)) continue;
      const full = join(directory, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if ([".ts", ".tsx"].includes(extname(entry))) found.push(full);
    }
  }

  for (const top of ["app", "components", "core", "features", "ee"]) {
    const directory = resolve(REPO_ROOT, top);
    if (existsSync(directory)) walk(directory);
  }

  return found;
}

describe("public navigation preferences", () => {
  it("offers both preference controls in every public shell", () => {
    const navbar = read(HEADER_SHELLS.navbar);

    expect(navbar.match(/<LocaleMenu/g)).toHaveLength(1);
    expect(navbar.match(/<ThemeSwitcher/g)).toHaveLength(1);
    expect(navbar.match(/\{renderPreferenceButtons\(\)\}/g)).toHaveLength(2);
    expect(navbar).toContain(
      'className="hidden items-center gap-1.5 justify-self-end xl:flex"',
    );
    expect(navbar).toContain(
      'className="col-span-3 flex w-full items-center justify-between xl:hidden"',
    );
    expect(navbar).toContain('className="my-1 py-3"');
    expect(navbar).not.toContain("border-y");
    expect(navbar).not.toContain("github.com/customermates/customermates");

    // The docs tree renders its own header rather than the public navbar, so without this it is the
    // one public surface with no way to change language or theme at all. Between them the two header
    // shells cover every URL in the sitemap.
    for (const [name, file] of Object.entries(HEADER_SHELLS)) {
      const source = read(file);
      expect(source, `${name} is missing the locale menu`).toContain(
        "<LocaleMenu",
      );
      expect(source, `${name} is missing the theme switcher`).toContain(
        "<ThemeSwitcher",
      );
    }

    // CUS-202 stripped duplicate preference controls from the footer. The two header shells still
    // own those controls, while the footer remains free to carry curated marketing links.
    const footer = read(FOOTER);
    expect(footer, "the header menu already links every locale").not.toContain(
      "<LocaleMenu",
    );
    expect(
      footer,
      "the theme switcher belongs to the header shells",
    ).not.toContain("<ThemeSwitcher");
    expect(footer, "raw directory backlinks are not navigation").not.toContain(
      "websitesdirectory",
    );
    expect(footer, "raw directory backlinks are not navigation").not.toContain(
      "bestsitesindex",
    );
    expect(footer, "raw directory backlinks are not navigation").not.toContain(
      "promotebusinessdirectory",
    );
    expect(footer, "comparison details belong behind the comparison hub").not.toContain("CompetitorLinks");
    expect(footer, "the resource column should use concise directory labels").toContain(
      't("NavigationBar.public.articlesAndGuides")',
    );
    expect(footer, "the resource column should expose one comparison directory link").toContain(
      't("NavigationBar.public.compare")',
    );
    expect(footer).not.toContain('t("Footer.blogViewAll")');
    expect(footer).not.toContain('t("Footer.compareViewAll")');
  });

  it("keeps the expanded marketing map restrained and shared with mobile", () => {
    const navbar = read(HEADER_SHELLS.navbar);
    const menu = read("app/components/navigation/public-navbar-menu.tsx");

    for (const href of [
      "/blog/agentic-crm",
      "/blog/open-source-crm",
      "/features/self-hosted",
      "/features/unified-inbox",
      "/for/agencies",
      "/for/professional-services",
    ]) {
      expect(
        navbar,
        `${href} is missing from the sitewide navigation`,
      ).toContain(`href: "${href}"`);
    }

    expect(navbar.match(/publicNavGroups\.map/gu)).toHaveLength(1);
    expect(navbar).toContain(
      '<Accordion collapsible className="w-full" type="single">',
    );
    expect(navbar).toContain("<MarketingContainer");
    expect(menu).toContain("<Popover");
    expect(menu).toContain("<PopoverAnchor");
    expect(menu).toContain("<PopoverContent");
    expect(menu).toContain("forceMount");
    expect(menu).toContain("portalled={false}");
    expect(menu).not.toContain("NavigationMenu");
    expect(menu).not.toContain('className="fixed');
    expect(menu).not.toContain("DropdownMenu");
    expect(menu).not.toMatch(
      /bg-(?:red|orange|amber|yellow|green|blue|violet|purple)-/u,
    );

    expect(navbar).toContain('id: "integrations"');
    expect(navbar).toContain('href: "/features/integrations"');
    expect(navbar).not.toContain("featured:");
    expect(navbar).not.toContain("secondary:");
    expect(menu).toContain("<ProviderMark");
    expect(menu).not.toContain("group.featured");
    expect(menu).toContain('"-mx-2.5 flex min-h-9');

    for (const providerHref of [
      "/features/linkedin-integration",
      "/features/outlook-integration",
      "/features/slack-integration",
    ]) {
      expect(
        navbar,
        `${providerHref} belongs under the integrations hub`,
      ).toContain(`href: "${providerHref}"`);
    }
  });

  it("keeps the six official theme-aware Featured On badges and outbound destinations", () => {
    const badges = read("app/components/footer-badges.tsx");

    for (const href of [
      "https://www.uneed.best/tool/customermates",
      "https://sourceforge.net/software/product/Customermates/",
      "https://twelve.tools",
      "https://wired.business",
      "https://startupfa.me/s/customermates",
      "https://open-launch.com/projects/customermates",
    ]) {
      expect(
        badges,
        `${href} is missing from the Featured On proof rail`,
      ).toContain(href);
    }

    for (const badgeAsset of [
      "https://www.uneed.best/POTW1.png",
      "https://www.uneed.best/POTW1A.png",
      "https://b.sf-syn.com/badge_img/3954503/light-default?variant_id=sf",
      "https://twelve.tools/badge2-light.svg",
      "https://wired.business/badge1-dark.svg",
      "https://startupfa.me/badges/featured/light.webp",
      "https://open-launch.com/api/badge/e6753e76-e978-4100-b29f-a3048622b9a6/featured-dark.svg",
    ]) {
      expect(badges, `${badgeAsset} is missing from the official badge rail`).toContain(badgeAsset);
    }

    expect(badges).toContain("<img");
    expect(badges).toContain("useServerTheme");
    expect(badges).toContain("MARQUEE_COPIES");
    expect(badges).toContain("prefers-reduced-motion");
    expect(badges).toContain(".footer-badges-track:focus-within");
    expect(badges).toContain("transform: translateX(0) !important");
  });

  it("keeps the locale menu renderable without JavaScript", () => {
    const menu = read("components/shared/locale-menu.tsx");

    // This is the whole reason the component is purpose-built rather than assembled from the shared
    // DropdownMenu. Radix portals its content, React never renders a portal during SSR, and the
    // rendered-but-closed workaround makes Radix aria-hide the rest of the page and swallow the
    // trigger's own pointerdown. A native disclosure ships every anchor in the server HTML instead,
    // which is what lets /de be discovered by a crawler that never opens the menu.
    expect(
      menu,
      "a portalled menu ships no anchors to a crawler",
    ).not.toContain("DropdownMenu");
    expect(menu, "the disclosure has to be native to render closed").toContain(
      "<details",
    );
    expect(menu, "the trigger has to be native to render closed").toContain(
      "<summary",
    );
    expect(menu, "each locale needs a real anchor, not a button").toContain(
      "hrefLang={locale}",
    );
    expect(
      menu,
      "the anchor must resolve to this page in the other locale",
    ).toContain("buildLocalePath(locale, pathname)");
    expect(menu, "a modified click must still open a new tab").toContain(
      "event.metaKey",
    );
    expect(
      menu,
      "the unsaved-changes guard still owns same-tab navigation",
    ).toContain("navigationGuard.tryNavigate");
    expect(menu, "the trigger shows the locale it is currently on").toContain(
      "currentLocale.toUpperCase()",
    );
    expect(menu, "the option matches the profile country selector").toContain(
      "<FormAutocompleteCountryItem countryKey={flagCodeFor(locale)} label={label} />",
    );
  });

  it("leaves no import of the retired dropdown-based selector", () => {
    expect(
      existsSync(join(REPO_ROOT, "components/shared/language-selector.tsx")),
    ).toBe(false);

    const stragglers = sourceFiles().filter((file) =>
      readFileSync(file, "utf8").includes("language-selector"),
    );
    expect(stragglers.map((file) => file.replace(REPO_ROOT + "/", ""))).toEqual(
      [],
    );
  });

  it("toggles directly between the resolved light and dark themes", () => {
    const themeSwitcher = read("components/shared/theme-switcher.tsx");

    expect(themeSwitcher).toContain(
      "resolvedTheme === Theme.dark ? Theme.dark : Theme.light",
    );
    expect(themeSwitcher).toContain(
      "selectedTheme === Theme.dark ? Theme.light : Theme.dark",
    );
    expect(themeSwitcher).toContain(
      '${t("Common.ariaLabels.themeSwitcher")}: ${selectedThemeLabel}',
    );
    expect(themeSwitcher).not.toContain("DropdownMenu");
  });
});
