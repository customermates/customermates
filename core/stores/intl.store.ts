import type { RootStore } from "./root.store";
import type { DateDisplayFormat } from "@/constants/date-format";

import { makeAutoObservable } from "mobx";
import { format, register } from "timeago.js";
import de from "timeago.js/lib/lang/de";
import en from "timeago.js/lib/lang/en_US";
import { Currency, Locale } from "@/generated/prisma";

register("de", de);
register("en", en);

export class IntlStore {
  constructor(private readonly rootStore: RootStore) {
    makeAutoObservable(this);
  }

  get companyCurrency() {
    return this.rootStore.companyStore.company?.currency;
  }

  get formattingLocale() {
    const user = this.rootStore.userStore.user;

    if (!user) return undefined;

    const locale = user.formattingLocale;

    switch (locale) {
      case Locale.de:
        return "de-DE";
      case Locale.en:
        return "en-US";
      default:
        return undefined;
    }
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
    if (value === undefined) return "";

    const numberFormatOptions: Intl.NumberFormatOptions = {
      style: "decimal" as const,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      useGrouping: true,
    };

    const formatOptions = {
      ...numberFormatOptions,
      useGrouping: options?.useGrouping ?? numberFormatOptions.useGrouping,
      maximumFractionDigits: options?.maximumFractionDigits ?? numberFormatOptions.maximumFractionDigits,
    };

    return new Intl.NumberFormat(this.formattingLocale, formatOptions).format(value);
  }

  formatNumericalLongDate(date: Date | undefined): string {
    if (date === undefined) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "numeric" as const,
      month: "2-digit" as const,
      day: "2-digit" as const,
    }).format(date);
  }

  formatNumericalShortDate(date: Date | undefined): string {
    if (date === undefined) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "2-digit" as const,
      month: "2-digit" as const,
      day: "2-digit" as const,
    }).format(date);
  }

  formatDescriptiveShortDate(date: Date | undefined): string {
    if (date === undefined) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "numeric" as const,
      month: "short" as const,
      day: "numeric" as const,
    }).format(date);
  }

  formatDescriptiveLongDate(date: Date | undefined): string {
    if (date === undefined) return "";

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "numeric" as const,
      month: "long" as const,
      day: "numeric" as const,
    }).format(date);
  }

  formatNumericalLongDateTime(date: Date | undefined): string {
    if (date === undefined) return "";

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

    return new Intl.DateTimeFormat(this.formattingLocale, {
      year: "numeric" as const,
      month: "long" as const,
      day: "numeric" as const,
      hour: "2-digit" as const,
      minute: "2-digit" as const,
    }).format(date);
  }

  formatRelativeTime(date: Date | undefined): string {
    if (date === undefined) return "";

    return format(date, this.rootStore.localeStore.locale);
  }
}
