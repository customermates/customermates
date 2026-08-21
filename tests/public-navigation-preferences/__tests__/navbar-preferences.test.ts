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
    expect(navbar.match(/\{renderPreferenceButtons\([^}]*\)\}/g)).toHaveLength(2);
    expect(navbar).toContain('const PUBLIC_NAV_DESKTOP_QUERY = "(min-width: 56rem)"');
    expect(navbar).toContain("useMediaQuery(PUBLIC_NAV_DESKTOP_QUERY)");
    expect(navbar).toContain("open={!isDesktop && layoutStore.isMenuOpen}");
    expect(navbar.match(/min-\[56rem\]:flex/g)).toHaveLength(3);
    expect(navbar.match(/min-\[56rem\]:hidden/g)).toHaveLength(1);
    expect(navbar).toContain('className="hidden items-center gap-2 min-[56rem]:flex"');
    expect(navbar).toContain('className="flex w-full items-center justify-between min-[56rem]:hidden"');
    expect(navbar).toContain('className="inline-flex rounded-full border border-sidebar-border/80');
    expect(navbar).toContain('aria-current={isNavItemActive(item.href) ? "page" : undefined}');
    expect(navbar).toContain('actions.signOut !== "setupEscape" &&');
    expect(navbar).toContain("ref={index === 0 ? firstMobileNavItemRef : undefined}");
    expect(navbar).toContain("firstMobileNavItemRef.current?.focus()");
    expect(navbar).toContain("desktopHomeButtonRef.current?.focus()");
    expect(navbar).toContain('className="mt-auto pt-12 sm:pt-16"');
    expect(navbar).not.toContain("border-y");
    expect(navbar).not.toContain("github.com/customermates/customermates");
    expect(footer).not.toContain("LanguageSelector");
    expect(footer).not.toContain("ThemeSwitcher");
  });

  it("shows the locale code with navbar typography and reuses the complete profile country option", () => {
    const languageSelector = readFileSync(join(REPO_ROOT, "components/shared/language-selector.tsx"), "utf8");
    const countrySelector = readFileSync(join(REPO_ROOT, "components/forms/form-autocomplete-country.tsx"), "utf8");
    const countryItem = readFileSync(join(REPO_ROOT, "components/forms/form-autocomplete-country-item.tsx"), "utf8");

    expect(languageSelector).toContain("currentLocale.toUpperCase()");
    expect(languageSelector).toContain('className={cn("size-8 rounded-md p-0 text-subdued", className)}');
    expect(languageSelector).not.toContain("text-[11px]");
    expect(languageSelector).toContain("FormAutocompleteItem({");
    expect(countrySelector).toContain("FormAutocompleteItem({");
    expect(languageSelector).toContain("textValue: label");
    expect(languageSelector).toContain(
      "<FormAutocompleteCountryItem countryKey={flagCodeFor(locale)} label={label} />",
    );
    expect(languageSelector).toContain('className={cn(isSelected && "bg-accent")}');
    expect(languageSelector).toContain("data-selected={isSelected}");
    expect(languageSelector).not.toContain("AvatarImage");
    expect(languageSelector).not.toContain("Check");
    expect(countryItem).toContain('<Avatar className={size === "sm" ? "size-3" : "size-5"}>');
    expect(countryItem).toContain('className="rounded-[inherit] object-cover"');
    expect(countryItem).toContain("flagcdn.com");
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
