import type { RootStore } from "./root.store";
import type { DateDisplayFormat } from "@/constants/date-format";

import { makeAutoObservable } from "mobx";
import { format, register } from "timeago.js";
import de from "timeago.js/lib/lang/de";
import en from "timeago.js/lib/lang/en_US";
import es from "timeago.js/lib/lang/es";
import fr from "timeago.js/lib/lang/fr";
import it from "timeago.js/lib/lang/it";
import { Currency } from "@/generated/prisma";

import type { AppLocale } from "@/i18n/locale-registry";

import { appLocaleOrDefault, formattingTagFor, isFormattingLocale } from "@/i18n/locale-registry";
import { resolveUserFormattingTag } from "@/i18n/user-locale";
import { formatLocalizedNumber, parseLocalizedNumber, parseLocalizedNumberToCanonical } from "./intl-number";

const TIMEAGO_LOCALES = { de, en, es, fr, it } satisfies Record<AppLocale, Parameters<typeof register>[1]>;

for (const [locale, definition] of Object.entries(TIMEAGO_LOCALES)) register(locale, definition);

export class IntlStore {
  constructor(private readonly rootStore: RootStore) {
    makeAutoObservable(this);
  }

  private clientHydrated = false;

  markClientHydrated = (): void => {
    this.clientHydrated = true;
  };

  get rendersZonedValues(): boolean {
    return this.clientHydrated;
  }

  get companyCurrency() {
    return this.rootStore.companyStore.company?.currency;
  }

  get formattingLocale() {
    const user = this.rootStore.userStore.user;
    const displayLocale = appLocaleOrDefault(this.rootStore.localeStore.locale);

    if (!user) return formattingTagFor(displayLocale);
    if (isFormattingLocale(user.formattingLocale)) return formattingTagFor(user.formattingLocale);
    return resolveUserFormattingTag(user, displayLocale);
  }

  get resolvedFormattingLanguageTag(): string {
    return this.formattingLocale;
  }

  get use12Hour(): boolean {
    const sample = new Intl.DateTimeFormat(this.formattingLocale, { hour: "numeric", minute: "numeric" }).format(
      new Date(2000, 0, 1, 13, 0, 0),
    );
    return /AM|PM|am|pm/.test(sample);
  }

  get dateFormatMap(): Record<DateDisplayFormat, (date: Date) => string> {
    return {
      numericalLong: (date) => this.formatNumericalLongDate(date),
      numericalShort: (date) => this.formatNumericalShortDate(date),
      descriptiveShort: (date) => this.formatDescriptiveShortDate(date),
      descriptiveLong: (date) => this.formatDescriptiveLongDate(date),
      relative: (date) => this.formatRelativeTime(date),
    };
  }

  get dateTimeFormatMap(): Record<DateDisplayFormat, (date: Date) => string> {
    return {
      numericalLong: (date) => this.formatNumericalLongDateTime(date),
      numericalShort: (date) => this.formatNumericalShortDateTime(date),
      descriptiveShort: (date) => this.formatDescriptiveShortDateTime(date),
      descriptiveLong: (date) => this.formatDescriptiveLongDateTime(date),
      relative: (date) => this.formatRelativeTime(date),
    };
  }

  formatCurrency(
    amount: number | undefined,
    currency?: string,
    options?: { minimumFractionDigits?: number; maximumFractionDigits?: number },
  ): string {
    if (amount === undefined) return "";

    return new Intl.NumberFormat(this.formattingLocale, {
      style: "currency",
      currency: currency || this.companyCurrency || Currency.eur,
      minimumFractionDigits: options?.minimumFractionDigits,
      maximumFractionDigits: options?.maximumFractionDigits,
    }).format(amount);
  }

  formatNumber(value: number | undefined, options?: { useGrouping?: boolean; maximumFractionDigits?: number }): string {
    return formatLocalizedNumber(value, this.formattingLocale, {
      style: "decimal",
      minimumFractionDigits: 0,
      maximumFractionDigits: options?.maximumFractionDigits ?? 2,
      useGrouping: options?.useGrouping ?? true,
    });
  }

  formatNumberForEditing(value: number | undefined, locale = this.formattingLocale): string {
    return formatLocalizedNumber(value, locale, { maximumFractionDigits: 20, useGrouping: false });
  }

  parseNumber(value: string, locale = this.formattingLocale): number | undefined {
    return parseLocalizedNumber(value, locale);
  }

  parseNumberToCanonical(value: string, locale = this.formattingLocale): string | undefined {
    return parseLocalizedNumberToCanonical(value, locale);
  }

  get collator(): Intl.Collator {
    return new Intl.Collator(this.formattingLocale);
  }

  formatNumericalLongDate(date: Date | undefined): string {
    if (date === undefined) return "";
    if (!this.clientHydrated) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "numeric" as const,
      month: "2-digit" as const,
      day: "2-digit" as const,
    }).format(date);
  }

  formatNumericalShortDate(date: Date | undefined): string {
    if (date === undefined) return "";
    if (!this.clientHydrated) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "2-digit" as const,
      month: "2-digit" as const,
      day: "2-digit" as const,
    }).format(date);
  }

  formatDescriptiveShortDate(date: Date | undefined): string {
    if (date === undefined) return "";
    if (!this.clientHydrated) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "numeric" as const,
      month: "short" as const,
      day: "numeric" as const,
    }).format(date);
  }

  formatDescriptiveLongDate(date: Date | undefined): string {
    if (date === undefined) return "";
    if (!this.clientHydrated) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "numeric" as const,
      month: "long" as const,
      day: "numeric" as const,
    }).format(date);
  }

  formatNumericalLongDateTime(date: Date | undefined): string {
    if (date === undefined) return "";
    if (!this.clientHydrated) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "numeric" as const,
      month: "2-digit" as const,
      day: "2-digit" as const,
      hour: "2-digit" as const,
      minute: "2-digit" as const,
    }).format(date);
  }

  formatNumericalShortDateTime(date: Date | undefined): string {
    if (date === undefined) return "";
    if (!this.clientHydrated) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "2-digit" as const,
      month: "2-digit" as const,
      day: "2-digit" as const,
      hour: "2-digit" as const,
      minute: "2-digit" as const,
    }).format(date);
  }

  formatDescriptiveShortDateTime(date: Date | undefined): string {
    if (date === undefined) return "";
    if (!this.clientHydrated) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "numeric" as const,
      month: "short" as const,
      day: "numeric" as const,
      hour: "2-digit" as const,
      minute: "2-digit" as const,
    }).format(date);
  }

  formatDescriptiveLongDateTime(date: Date | undefined): string {
    if (date === undefined) return "";
    if (!this.clientHydrated) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "numeric" as const,
      month: "long" as const,
      day: "numeric" as const,
      hour: "2-digit" as const,
      minute: "2-digit" as const,
    }).format(date);
  }

  formatTime(date: Date | undefined): string {
    if (date === undefined) return "";
    if (!this.clientHydrated) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      hour: "2-digit" as const,
      minute: "2-digit" as const,
    }).format(date);
  }

  formatRelativeTime(date: Date | undefined): string {
    if (date === undefined) return "";
    if (!this.clientHydrated) return "";

    return format(date, this.rootStore.localeStore.locale);
  }
}
