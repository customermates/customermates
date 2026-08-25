import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

describe("public navigation preferences", () => {
  it("keeps preferences in the navbar and only the crawlable locale links in the footer", () => {
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
    // Split deliberately. CUS-202 moved both controls into the navbar; the theme switcher stays
    // there, so only the locale links come back. They have to, and they have to be plain anchors:
    // LanguageSelector is a Radix dropdown whose content is portalled, and React never renders a
    // portal during SSR, so reusing it here would ship zero anchors and leave hreflang as the only
    // tie between the locale trees. Slack and Notion resolve it the same way, with a footer locale
    // menu of real anchors; Stripe, Shopify and Figma ship none at all, which their authority can
    // carry and 52 referring domains cannot.
    expect(footer, "the theme switcher belongs to the navbar alone").not.toContain("ThemeSwitcher");
    expect(footer, "the portalled dropdown renders no crawlable anchor").not.toContain("LanguageSelector");
    expect(footer, "each locale needs a real anchor, not a button").toContain("hrefLang={locale}");
    expect(footer, "the anchor must resolve to this page in the other locale").toContain(
      "buildLocalePath(locale, pathname)",
    );
    expect(footer, "the row has to survive a third and fourth content locale").toContain("flex-wrap");
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
