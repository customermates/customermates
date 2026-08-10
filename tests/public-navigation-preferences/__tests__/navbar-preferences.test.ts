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

  it("shows the locale code and toggles directly between the resolved light and dark themes", () => {
    const languageSelector = readFileSync(join(REPO_ROOT, "components/shared/language-selector.tsx"), "utf8");
    const themeSwitcher = readFileSync(join(REPO_ROOT, "components/shared/theme-switcher.tsx"), "utf8");

    expect(languageSelector).toContain("currentLocale.toUpperCase()");
    expect(languageSelector).toContain('<DropdownMenuContent align="start"');
    expect(languageSelector).not.toContain("flagcdn.com");
    expect(themeSwitcher).toContain("resolvedTheme === Theme.dark ? Theme.dark : Theme.light");
    expect(themeSwitcher).toContain("selectedTheme === Theme.dark ? Theme.light : Theme.dark");
    expect(themeSwitcher).toContain('${t("Common.ariaLabels.themeSwitcher")}: ${selectedThemeLabel}');
    expect(themeSwitcher).not.toContain("DropdownMenu");
  });
});
