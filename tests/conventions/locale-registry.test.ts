import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

import {
  APP_LOCALES,
  CONTENT_LOCALES,
  DEFAULT_LOCALE,
  FORMATTING_LOCALES,
  LOCALE_REGISTRY,
  MARKETING_LOCALES,
  PARTIAL_MARKETING_LOCALES,
  REGISTERED_LOCALES,
  ROUTING_LOCALES,
  appLocaleFromLanguageTag,
  buildLocalePath,
  isAppLocale,
  isContentLocale,
  isFormattingLocale,
  isMarketingLocale,
  isMarketingPathPublished,
  isRoutingLocale,
  partialMarketingPaths,
  routingLocaleFromUrlSegment,
  stripLocalePrefix,
  validationTagFor,
} from "@/i18n/locale-registry";

const ENFORCED = true;

const LOCALE_TAG = /^[a-z]{2}(?:-[A-Za-z0-9]{2,8})*$/;

function prismaLocaleEnumValues(): string[] {
  const schema = readFileSync(join(REPO_ROOT, "prisma", "schema.prisma"), "utf8");
  const block = schema.match(/enum Locale \{([\s\S]*?)\}/);
  if (!block) throw new Error("prisma/schema.prisma no longer declares an enum named Locale");
  return block[1]
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("//"));
}

function localeMessages(locale: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(REPO_ROOT, "i18n", "locales", `${locale}.json`), "utf8"));
}

describe("locale registry", () => {
  it.skipIf(!ENFORCED)("derives the routing set as the union of the app and content sets", () => {
    expect([...ROUTING_LOCALES].sort()).toEqual([...new Set([...APP_LOCALES, ...CONTENT_LOCALES])].sort());
    for (const locale of APP_LOCALES) expect(isRoutingLocale(locale)).toBe(true);
    for (const locale of CONTENT_LOCALES) expect(isRoutingLocale(locale)).toBe(true);
  });

  it.skipIf(!ENFORCED)("keeps the default locale in both domains", () => {
    expect(isAppLocale(DEFAULT_LOCALE)).toBe(true);
    expect(isContentLocale(DEFAULT_LOCALE)).toBe(true);
    expect(isFormattingLocale(DEFAULT_LOCALE)).toBe(true);
  });

  it.skipIf(!ENFORCED)("uses well-formed language tags", () => {
    for (const locale of ROUTING_LOCALES) expect(locale, `${locale} is not a BCP-47 language tag`).toMatch(LOCALE_TAG);
    for (const locale of ROUTING_LOCALES) {
      expect(LOCALE_REGISTRY[locale].formattingTag, `${locale} formattingTag`).toMatch(LOCALE_TAG);
      expect(LOCALE_REGISTRY[locale].flagCode, `${locale} flagCode`).toMatch(/^[a-z]{2}$/);
      expect(LOCALE_REGISTRY[locale].defaultCurrency, `${locale} defaultCurrency`).toMatch(/^[A-Z]{3}$/);
    }
  });

  it.skipIf(!ENFORCED)("ships a message bundle for every routing locale", () => {
    const missing = ROUTING_LOCALES.filter(
      (locale) => !existsSync(join(REPO_ROOT, "i18n", "locales", `${locale}.json`)),
    );
    expect(missing, `routing locales without i18n/locales/<locale>.json:\n${missing.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED)("names every routing locale in every bundle's Common.locales", () => {
    const problems: string[] = [];

    for (const bundleLocale of ROUTING_LOCALES) {
      const messages = localeMessages(bundleLocale) as { Common?: { locales?: Record<string, string> } };
      const names = messages.Common?.locales ?? {};

      for (const named of [...new Set([...ROUTING_LOCALES, ...FORMATTING_LOCALES]), "system"]) {
        if (!names[named]) problems.push(`${bundleLocale}.json is missing Common.locales.${named}`);
      }
    }

    expect(problems, `language labels missing:\n${problems.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED)("keeps every app locale representable in the persisted display-language column", () => {
    const enumValues = prismaLocaleEnumValues();
    const missing = APP_LOCALES.filter((locale) => !enumValues.includes(locale));
    expect(
      missing,
      `app locales absent from the Prisma Locale enum (add an ALTER TYPE migration):\n${missing.join("\n")}`,
    ).toEqual([]);
    expect(enumValues, "the Prisma Locale enum must keep the 'system' member").toContain("system");
  });

  it.skipIf(!ENFORCED)("keeps every formatting locale representable in the persisted formatting column", () => {
    const enumValues = prismaLocaleEnumValues();
    const missing = FORMATTING_LOCALES.filter((locale) => !enumValues.includes(locale));
    expect(
      missing,
      `formatting locales absent from the Prisma Locale enum (add an ALTER TYPE migration):\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it.skipIf(!ENFORCED)("resolves every app locale's browser and validation adapters", async () => {
    for (const locale of APP_LOCALES) {
      expect(appLocaleFromLanguageTag(LOCALE_REGISTRY[locale].formattingTag), `${locale} browser tag`).toBe(locale);
      await expect(
        import(`zod/v4/locales/${validationTagFor(locale)}.js`),
        `${locale} Zod locale`,
      ).resolves.toBeTruthy();
    }

    expect(routingLocaleFromUrlSegment("en-US")).toBeNull();
    expect(routingLocaleFromUrlSegment("EN")).toBe("en");
  });

  it.skipIf(!ENFORCED)("round-trips locale-prefixed paths through buildLocalePath and stripLocalePrefix", () => {
    const paths = ["/", "/pricing", "/blog/best-crm-software", "/docs/openapi/create-contact", "/auth/signin"];

    for (const locale of ROUTING_LOCALES) {
      for (const path of paths) {
        expect(stripLocalePrefix(buildLocalePath(locale, path)), `${locale} ${path}`).toBe(path);
      }
      expect(buildLocalePath(locale, "/")).toBe(`/${locale}`);
    }
  });

  it.skipIf(!ENFORCED)("keeps route segments distinguishable from locale prefixes", () => {
    const localeRoot = join(REPO_ROOT, "app", "[locale]");
    const groups = readdirSync(localeRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    const segments = groups.flatMap((group) =>
      readdirSync(join(localeRoot, group), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    );

    const ambiguous = segments.filter((segment) => /^[a-z]{2}$/.test(segment));
    expect(
      ambiguous,
      `two-letter route segments collide with locale prefixes and break the unsupported-prefix guard:\n${ambiguous.join("\n")}`,
    ).toEqual([]);
  });

  it.skipIf(!ENFORCED)("keeps full content, partial marketing and app locales distinct", () => {
    for (const locale of REGISTERED_LOCALES) {
      const paths = LOCALE_REGISTRY[locale].marketingPaths;
      expect(paths === "all", `${locale}: marketingPaths "all" must match hasPublishedContent`).toBe(
        LOCALE_REGISTRY[locale].hasPublishedContent,
      );
    }
    for (const locale of PARTIAL_MARKETING_LOCALES) {
      expect(isContentLocale(locale), `${locale} is partial, not a full content locale`).toBe(false);
      expect(isAppLocale(locale), `${locale} must also be an app locale to route`).toBe(true);
      expect(CONTENT_LOCALES).not.toContain(locale);
      expect(isMarketingLocale(locale)).toBe(true);
    }
    expect([...MARKETING_LOCALES].sort()).toEqual(
      [...new Set([...CONTENT_LOCALES, ...PARTIAL_MARKETING_LOCALES])].sort(),
    );
  });

  it.skipIf(!ENFORCED)("publishes a partial locale only on its explicit marketing paths", () => {
    for (const locale of PARTIAL_MARKETING_LOCALES) {
      const paths = partialMarketingPaths(locale);
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        expect(path, `${locale} scope path ${path}`).toMatch(/^\/(?:[a-z0-9-]+(?:\/[a-z0-9-]+)*)?$/);
        expect(isMarketingPathPublished(locale, path)).toBe(true);
        expect(isMarketingPathPublished(locale, `${path === "/" ? "" : path}/`)).toBe(true);
      }
      for (const path of ["/blog", "/docs", "/privacy", "/for/page/2", "/features/all"])
        expect(isMarketingPathPublished(locale, path), `${locale} ${path}`).toBe(false);
    }
    for (const locale of CONTENT_LOCALES) expect(isMarketingPathPublished(locale, "/blog")).toBe(true);
  });
});

