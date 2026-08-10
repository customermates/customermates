import { describe, expect, it } from "vitest";

import { APP_LOCALES } from "@/i18n/locale-registry";
import {
  calendarDayKey,
  calendarIntlFormatters,
  DAY_PICKER_LOCALES,
  dayPickerLocaleFor,
  localeWeekInfo,
} from "@/components/ui/calendar-locales";

describe("calendar locales", () => {
  it("defines an adapter for every application display locale", () => {
    expect(Object.keys(DAY_PICKER_LOCALES).sort()).toEqual([...APP_LOCALES].sort());
  });

  it.each([
    ["en", "March", "Monday"],
    ["de", "März", "Montag"],
    ["fr", "mars", "lundi"],
    ["it", "marzo", "lunedì"],
    ["es", "marzo", "lunes"],
  ] as const)("localizes month and weekday labels for %s", (locale, month, weekday) => {
    const adapter = DAY_PICKER_LOCALES[locale];

    expect(adapter.localize?.month(2, { width: "wide" })).toBe(month);
    expect(adapter.localize?.day(1, { width: "wide" })).toBe(weekday);
  });

  it("uses a locale-independent local calendar key", () => {
    expect(calendarDayKey(new Date(2026, 2, 9, 23, 59, 59))).toBe("2026-03-09");
  });

  it("preserves regional week conventions for System formatting", () => {
    expect(dayPickerLocaleFor("en", "en-US").options?.weekStartsOn).toBe(0);
    expect(dayPickerLocaleFor("en", "en-CA").options?.weekStartsOn).toBe(0);
    expect(dayPickerLocaleFor("en", "en-GB").options?.weekStartsOn).toBe(1);
    expect(dayPickerLocaleFor("en", "en-AU").options?.weekStartsOn).toBe(1);
    expect(dayPickerLocaleFor("es", "es-ES").options?.weekStartsOn).toBe(1);
    expect(dayPickerLocaleFor("es", "es-MX").options?.weekStartsOn).toBe(0);
    expect(dayPickerLocaleFor("fr", "fr-FR").options?.weekStartsOn).toBe(1);
    expect(dayPickerLocaleFor("fr", "fr-CA").options?.weekStartsOn).toBe(0);
  });

  it("supports browsers that expose week information as a method", () => {
    const weekInfo = localeWeekInfo(
      { getWeekInfo: () => ({ firstDay: 7, minimalDays: 1 }) } as Intl.Locale & {
        getWeekInfo: () => { firstDay: number; minimalDays: number };
      },
      { firstWeekContainsDate: 4, weekStartsOn: 1 },
    );

    expect(weekInfo).toEqual({ firstDay: 7, minimalDays: 1 });
  });

  it("formats System calendar dates in an unregistered browser language", () => {
    const formatters = calendarIntlFormatters("nl-NL");
    const march = new Date(2026, 2, 9);

    expect(formatters.formatCaption?.(march)).toBe("maart 2026");
    expect(formatters.formatWeekdayName?.(march)).toBe("ma");
  });

  it("keeps DayPicker on the Gregorian calendar for System languages with another default calendar", () => {
    const formatters = calendarIntlFormatters("fa-IR");
    const march = new Date(2026, 2, 9);

    expect(formatters.formatDay?.(march)).toBe("۹");
    expect(formatters.formatCaption?.(march)).toBe("مارس ۲۰۲۶");
  });
});
