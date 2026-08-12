import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";
import { REPO_ROOT } from "@/tests/conventions/walk";

import {
  GLOBAL_ERROR_COPY,
  assertGlobalErrorCopyCoverage,
  defaultGlobalErrorFallback,
  resolveGlobalErrorLocale,
} from "../global-error-copy";

type ErrorCardCatalog = { ErrorCard: Record<string, string> };

function errorCardCopy(locale: string): Record<string, string> {
  const raw = readFileSync(join(REPO_ROOT, "i18n", "locales", `${locale}.json`), "utf8");
  return (JSON.parse(raw) as ErrorCardCatalog).ErrorCard;
}

describe("global error fallback", () => {
  it("stays aligned with the catalog copy for every application locale", () => {
    expect(assertGlobalErrorCopyCoverage()).toBe(true);

    for (const locale of APP_LOCALES) {
      const errorCard = errorCardCopy(locale);

      expect(GLOBAL_ERROR_COPY[locale]).toEqual({
        backLabel: errorCard.ctaLabel,
        body: errorCard.contactSupport,
        retryLabel: errorCard.retry,
        subtitle: errorCard.subtitle,
        title: errorCard.title,
      });
    }
  });

  it.each(APP_LOCALES)("prefers the route locale for /%s failures", (locale) => {
    expect(resolveGlobalErrorLocale(`/${locale}/dashboard`, ["en-US"])).toBe(locale);
  });

  it("falls back through canonical browser languages and then the default", () => {
    expect(resolveGlobalErrorLocale("/dashboard", ["pt-BR", "fr-FR"])).toBe("fr");
    expect(resolveGlobalErrorLocale("/dashboard", ["not-a-locale"])).toBe("en");
  });

  it("uses a deterministic default for server rendering and initial hydration", () => {
    expect(defaultGlobalErrorFallback()).toEqual({ copy: GLOBAL_ERROR_COPY.en, locale: "en" });
  });
});
