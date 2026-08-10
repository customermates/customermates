import { Currency } from "@/generated/prisma";

export const CURRENCIES: ReadonlyArray<{ key: Currency }> = Object.values(Currency)
  .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  .map((key) => ({ key }));

export function getCurrencyLabel(currency: string, locale: string): string {
  const code = currency.toUpperCase();

  try {
    const localizedName = new Intl.DisplayNames([locale], {
      type: "currency",
    }).of(code);
    return localizedName && localizedName !== code ? `${localizedName} (${code})` : code;
  } catch {
    return code;
  }
}
