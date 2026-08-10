import { describe, expect, it } from "vitest";

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import esMessages from "@/i18n/locales/es.json";
import frMessages from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { APP_LOCALES } from "@/i18n/locale-registry";

import {
  GLOBAL_ERROR_COPY,
  assertGlobalErrorCopyCoverage,
  defaultGlobalErrorFallback,
  resolveGlobalErrorLocale,
} from "../global-error-copy";

const CATALOGS = { de: deMessages, en: enMessages, es: esMessages, fr: frMessages, it: itMessages } as const;

describe("global error fallback", () => {
  it("stays aligned with the catalog copy for every application locale", () => {
    expect(assertGlobalErrorCopyCoverage()).toBe(true);

    for (const [locale, messages] of Object.entries(CATALOGS)) {
      expect(GLOBAL_ERROR_COPY[locale as keyof typeof CATALOGS]).toEqual({
        backLabel: messages.ErrorCard.ctaLabel,
        body: messages.ErrorCard.contactSupport,
        retryLabel: messages.ErrorCard.retry,
        subtitle: messages.ErrorCard.subtitle,
        title: messages.ErrorCard.title,
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
