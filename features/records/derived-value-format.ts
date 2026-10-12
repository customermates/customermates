import { DEFAULT_LOCALE, formattingTagFor } from "@/i18n/locale-registry";

export const DERIVED_VALUE_FRACTION_DIGITS = 2;

export function currencyFractionDigits(currency: string): number {
  try {
    return (
      new Intl.NumberFormat(formattingTagFor(DEFAULT_LOCALE), { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? DERIVED_VALUE_FRACTION_DIGITS
    );
  } catch {
    return DERIVED_VALUE_FRACTION_DIGITS;
  }
}

export function derivedFractionDigits(decimalPlaces: number | null | undefined, currency?: string | null): number {
  return decimalPlaces ?? (currency ? currencyFractionDigits(currency) : DERIVED_VALUE_FRACTION_DIGITS);
}
