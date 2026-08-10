import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

describe("public navigation preferences", () => {
  it("renders language and theme controls in desktop and mobile navigation, but not the footer", () => {
    const navbar = readFileSync(join(REPO_ROOT, "app/components/public-navbar.tsx"), "utf8");
    const footer = readFileSync(join(REPO_ROOT, "app/components/footer-content.tsx"), "utf8");

    expect(navbar.match(/<LanguageSelector/g)).toHaveLength(1);
    expect(navbar.match(/<ThemeSwitcher/g)).toHaveLength(1);
    expect(navbar.match(/\{renderPreferenceButtons\(\)\}/g)).toHaveLength(2);
    expect(navbar).toContain('className="hidden items-center gap-2 md:flex"');
    expect(navbar).toContain('className="flex w-full items-center justify-between md:hidden"');
    expect(navbar).not.toContain("github.com/customermates/customermates");
    expect(footer).not.toContain("LanguageSelector");
    expect(footer).not.toContain("ThemeSwitcher");
  });

  it("shows the locale code with navbar typography and country-style flags in its menu", () => {
    const languageSelector = readFileSync(join(REPO_ROOT, "components/shared/language-selector.tsx"), "utf8");

    expect(languageSelector).toContain("currentLocale.toUpperCase()");
    expect(languageSelector).toContain('className={cn("size-8 rounded-md p-0 text-subdued", className)}');
    expect(languageSelector).not.toContain("text-[11px]");
    expect(languageSelector).toContain('<Avatar className="size-5">');
    expect(languageSelector).toContain("flagCodeFor(locale)");
    expect(languageSelector).toContain("flagcdn.com");
    expect(languageSelector).toContain('<DropdownMenuContent align="start"');
  });

  it("toggles directly between the resolved light and dark themes", () => {
    const themeSwitcher = readFileSync(join(REPO_ROOT, "components/shared/theme-switcher.tsx"), "utf8");

    expect(themeSwitcher).toContain("resolvedTheme === Theme.dark ? Theme.dark : Theme.light");
    expect(themeSwitcher).toContain("selectedTheme === Theme.dark ? Theme.light : Theme.dark");
    expect(themeSwitcher).toContain('${t("Common.ariaLabels.themeSwitcher")}: ${selectedThemeLabel}');
    expect(themeSwitcher).not.toContain("DropdownMenu");
  });
});
