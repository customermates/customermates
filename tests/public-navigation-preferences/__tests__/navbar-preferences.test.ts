import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

const SHELLS = {
  navbar: "app/components/public-navbar.tsx",
  docsTopBar: "app/[locale]/(static)/docs/components/docs-topbar.tsx",
  footer: "app/components/footer-content.tsx",
} as const;

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
    const navbar = read(SHELLS.navbar);

    expect(navbar.match(/<LocaleMenu/g)).toHaveLength(1);
    expect(navbar.match(/<ThemeSwitcher/g)).toHaveLength(1);
    expect(navbar.match(/\{renderPreferenceButtons\(\)\}/g)).toHaveLength(2);
    expect(navbar).toContain('className="hidden items-center gap-2 md:flex"');
    expect(navbar).toContain('className="flex w-full items-center justify-between md:hidden"');
    expect(navbar).toContain('className="my-1 py-3"');
    expect(navbar).not.toContain("border-y");
    expect(navbar).not.toContain("github.com/customermates/customermates");

    // The docs tree renders its own header rather than the public navbar, so without this it is the
    // one public surface with no way to change language or theme at all.
    for (const [name, file] of Object.entries(SHELLS)) {
      const source = read(file);
      expect(source, `${name} is missing the locale menu`).toContain("<LocaleMenu");
      expect(source, `${name} is missing the theme switcher`).toContain("<ThemeSwitcher");
    }
  });

  it("keeps the locale menu renderable without JavaScript", () => {
    const menu = read("components/shared/locale-menu.tsx");

    // This is the whole reason the component is purpose-built rather than assembled from the shared
    // DropdownMenu. Radix portals its content, React never renders a portal during SSR, and the
    // rendered-but-closed workaround makes Radix aria-hide the rest of the page and swallow the
    // trigger's own pointerdown. A native disclosure ships every anchor in the server HTML instead,
    // which is what lets /de be discovered by a crawler that never opens the menu.
    expect(menu, "a portalled menu ships no anchors to a crawler").not.toContain("DropdownMenu");
    expect(menu, "the disclosure has to be native to render closed").toContain("<details");
    expect(menu, "the trigger has to be native to render closed").toContain("<summary");
    expect(menu, "each locale needs a real anchor, not a button").toContain("hrefLang={locale}");
    expect(menu, "the anchor must resolve to this page in the other locale").toContain(
      "buildLocalePath(locale, pathname)",
    );
    expect(menu, "a modified click must still open a new tab").toContain("event.metaKey");
    expect(menu, "the unsaved-changes guard still owns same-tab navigation").toContain(
      "navigationGuard.tryNavigate",
    );
    expect(menu, "the trigger shows the locale it is currently on").toContain("currentLocale.toUpperCase()");
    expect(menu, "the option matches the profile country selector").toContain(
      "<FormAutocompleteCountryItem countryKey={flagCodeFor(locale)} label={label} />",
    );
  });

  it("leaves no import of the retired dropdown-based selector", () => {
    expect(existsSync(join(REPO_ROOT, "components/shared/language-selector.tsx"))).toBe(false);

    const stragglers = sourceFiles().filter((file) => readFileSync(file, "utf8").includes("language-selector"));
    expect(stragglers.map((file) => file.replace(REPO_ROOT + "/", ""))).toEqual([]);
  });

  it("toggles directly between the resolved light and dark themes", () => {
    const themeSwitcher = read("components/shared/theme-switcher.tsx");

    expect(themeSwitcher).toContain("resolvedTheme === Theme.dark ? Theme.dark : Theme.light");
    expect(themeSwitcher).toContain("selectedTheme === Theme.dark ? Theme.light : Theme.dark");
    expect(themeSwitcher).toContain('${t("Common.ariaLabels.themeSwitcher")}: ${selectedThemeLabel}');
    expect(themeSwitcher).not.toContain("DropdownMenu");
  });
});
