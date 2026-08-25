import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

describe("public navigation preferences", () => {
  it("keeps the dropdown selector in the navbar and a crawlable locale link in the footer", () => {
    const navbar = readFileSync(join(REPO_ROOT, "app/components/public-navbar.tsx"), "utf8");
    const footer = readFileSync(join(REPO_ROOT, "app/components/footer-content.tsx"), "utf8");

    expect(navbar.match(/<LanguageSelector/g)).toHaveLength(1);
    expect(navbar.match(/<ThemeSwitcher/g)).toHaveLength(1);
    expect(navbar.match(/\{renderPreferenceButtons\(\)\}/g)).toHaveLength(2);
    expect(navbar).toContain('className="hidden items-center gap-2 md:flex"');
    expect(navbar).toContain('className="flex w-full items-center justify-between md:hidden"');
    expect(navbar).toContain('className="my-1 py-3"');
    expect(navbar).not.toContain("border-y");
    expect(navbar).not.toContain("github.com/customermates/customermates");
    // CUS-202 moved these controls into the navbar and stripped the footer duplicates. The footer
    // then carried no anchor between the locale trees at all, and /de sat at "Crawled - currently
    // not indexed". LanguageSelector is a Radix dropdown whose content is portalled, so it renders
    // zero anchors server-side: reusing it here would look correct and silently restore that bug.
    // The footer therefore gets a plain link per locale, and the navbar keeps the dropdown.
    expect(footer, "the portalled dropdown renders no crawlable anchor").not.toContain("LanguageSelector");
    expect(footer, "the theme control is shared with the navbar").toContain("ThemeSwitcher");
    expect(footer, "each locale needs a real anchor, not a button").toContain("hrefLang={locale}");
    expect(footer, "the anchor must resolve to this page in the other locale").toContain(
      "buildLocalePath(locale, pathname)",
    );
  });

  it("shows the locale code with navbar typography and reuses the complete profile country option", () => {
    const languageSelector = readFileSync(join(REPO_ROOT, "components/shared/language-selector.tsx"), "utf8");
    const countrySelector = readFileSync(join(REPO_ROOT, "components/forms/form-autocomplete-country.tsx"), "utf8");
    const countryItem = readFileSync(
      join(REPO_ROOT, "components/forms/form-autocomplete-country-item.tsx"),
      "utf8",
    );

    expect(languageSelector).toContain("currentLocale.toUpperCase()");
    expect(languageSelector).toContain('className={cn("size-8 rounded-md p-0 text-subdued", className)}');
    expect(languageSelector).not.toContain("text-[11px]");
    expect(languageSelector).toContain("FormAutocompleteItem({");
    expect(countrySelector).toContain("FormAutocompleteItem({");
    expect(languageSelector).toContain("textValue: label");
    expect(languageSelector).toContain('<FormAutocompleteCountryItem countryKey={flagCodeFor(locale)} label={label} />');
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
