import type { Day, FirstWeekContainsDate, Locale } from "date-fns";
import type { Formatters } from "react-day-picker";

import { de, enUS, es, fr, it } from "react-day-picker/locale";

import type { AppLocale } from "@/i18n/locale-registry";

export const DAY_PICKER_LOCALES = { de, en: enUS, es, fr, it } satisfies Record<AppLocale, Locale>;

type LocaleWeekInfo = { firstDay: number; minimalDays: number };

type LocaleWithWeekInfo = Intl.Locale & {
  getWeekInfo?: () => LocaleWeekInfo;
  weekInfo?: LocaleWeekInfo;
};

export function localeWeekInfo(locale: LocaleWithWeekInfo, fallback: Locale["options"]): LocaleWeekInfo {
  const weekInfo = locale.weekInfo ?? locale.getWeekInfo?.();

  if (weekInfo) return weekInfo;

  return {
    firstDay: fallback?.weekStartsOn === 0 ? 7 : (fallback?.weekStartsOn ?? 1),
    minimalDays: fallback?.firstWeekContainsDate === 4 ? 4 : 1,
  };
}

export function dayPickerLocaleFor(locale: AppLocale, languageTag: string): Locale {
  const baseLocale = DAY_PICKER_LOCALES[locale];
  const weekInfo = localeWeekInfo(new Intl.Locale(languageTag) as LocaleWithWeekInfo, baseLocale.options);
  const firstWeekContainsDate: FirstWeekContainsDate = weekInfo.minimalDays >= 4 ? 4 : 1;
  const weekStartsOn = (weekInfo.firstDay % 7) as Day;

  return {
    ...baseLocale,
    options: {
      ...baseLocale.options,
      firstWeekContainsDate,
      weekStartsOn,
    },
  };
}

export function calendarIntlFormatters(languageTag: string): Partial<Formatters> {
  const day = new Intl.DateTimeFormat(languageTag, { calendar: "gregory", day: "numeric" });
  const month = new Intl.DateTimeFormat(languageTag, { calendar: "gregory", month: "long" });
  const monthYear = new Intl.DateTimeFormat(languageTag, {
    calendar: "gregory",
    month: "long",
    year: "numeric",
  });
  const weekdayShort = new Intl.DateTimeFormat(languageTag, { calendar: "gregory", weekday: "short" });
  const year = new Intl.DateTimeFormat(languageTag, { calendar: "gregory", year: "numeric" });

  return {
    formatCaption: (date) => monthYear.format(date),
    formatDay: (date) => day.format(date),
    formatMonthDropdown: (date) => month.format(date),
    formatWeekdayName: (date) => weekdayShort.format(date),
    formatYearDropdown: (date) => year.format(date),
  };
}

export function calendarDayKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
