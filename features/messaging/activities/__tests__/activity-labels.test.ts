import { describe, expect, it } from "vitest";

import deMessages from "@/i18n/locales/de.json";
import enMessages from "@/i18n/locales/en.json";
import esMessages from "@/i18n/locales/es.json";
import frMessages from "@/i18n/locales/fr.json";
import itMessages from "@/i18n/locales/it.json";
import { APP_LOCALES, type AppLocale } from "@/i18n/locale-registry";

import { calendarEventTitle } from "../activity-labels";

const NO_TITLE = {
  de: deMessages.ContactHistory.calendarNoTitle,
  en: enMessages.ContactHistory.calendarNoTitle,
  es: esMessages.ContactHistory.calendarNoTitle,
  fr: frMessages.ContactHistory.calendarNoTitle,
  it: itMessages.ContactHistory.calendarNoTitle,
} satisfies Record<AppLocale, string>;

describe("calendarEventTitle", () => {
  it.each(APP_LOCALES)("localizes blank and legacy calendar titles for %s", (locale) => {
    expect(calendarEventTitle("   ", NO_TITLE[locale])).toBe(NO_TITLE[locale]);
    expect(calendarEventTitle("(no title)", NO_TITLE[locale])).toBe(NO_TITLE[locale]);
  });

  it("preserves provider-supplied titles", () => {
    expect(calendarEventTitle("  Quarterly review  ", "No title")).toBe("Quarterly review");
  });
});
