import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import { CONTENT_LOCALES, DEFAULT_LOCALE, ROUTING_LOCALES, isContentLocale } from "@/i18n/locale-registry";

const ENFORCED = true;

const THEMES = ["light", "dark"];

function localizedImages(theme: string, locale: string): string[] {
  const dir = join(REPO_ROOT, "public", "images", theme, locale);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => !file.startsWith("."))
    .sort();
}

describe("localized assets", () => {
  it.skipIf(!ENFORCED)("ships the same hero images for every content locale", () => {
    const problems: string[] = [];

    for (const theme of THEMES) {
      const reference = new Set(localizedImages(theme, DEFAULT_LOCALE));
      expect(reference.size, `public/images/${theme}/${DEFAULT_LOCALE} should not be empty`).toBeGreaterThan(0);

      for (const locale of CONTENT_LOCALES) {
        if (locale === DEFAULT_LOCALE) continue;
        const localeImages = new Set(localizedImages(theme, locale));

        for (const file of reference) {
          if (!localeImages.has(file)) problems.push(`public/images/${theme}/${locale} is missing ${file}`);
        }
        for (const file of localeImages) {
          if (!reference.has(file)) {
            problems.push(`public/images/${theme}/${DEFAULT_LOCALE} is missing ${file} (present in ${locale})`);
          }
        }
      }
    }

    expect(
      problems,
      `localized hero images drive Article JSON-LD and marketing screenshots:\n${problems.join("\n")}`,
    ).toEqual([]);
  });

  it.skipIf(!ENFORCED)("ships no localized images for an application-only locale", () => {
    const problems: string[] = [];

    for (const locale of ROUTING_LOCALES) {
      if (isContentLocale(locale)) continue;
      for (const theme of THEMES) {
        const dir = join(REPO_ROOT, "public", "images", theme, locale);
        if (existsSync(dir)) problems.push(`${dir} belongs to a locale with no published content`);
      }
    }

    expect(problems, `unreachable localized assets:\n${problems.join("\n")}`).toEqual([]);
  });
});
