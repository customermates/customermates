export const WIDGET_NUMBER_COMPACT_FROM = 10_000;

type DecimalFormat = (
  value: string | number,
  options: { currency?: string | null; compact?: boolean; maximumFractionDigits?: number },
) => string;

type WidgetNumberOptions = { currency: string | null; fractionDigits: number; integer?: boolean };

export type WidgetNumberText = { display: string; exact: string };

export function formatWidgetNumber(
  value: string | number,
  { currency, fractionDigits, integer = false }: WidgetNumberOptions,
  decimal: DecimalFormat,
): WidgetNumberText {
  const exact = decimal(value, { currency, maximumFractionDigits: integer ? 0 : fractionDigits });
  const magnitude = Math.abs(Number(value));
  if (integer || !Number.isFinite(magnitude) || magnitude < WIDGET_NUMBER_COMPACT_FROM)
    return { display: exact, exact };
  return { display: decimal(Number(value), { currency, compact: true, maximumFractionDigits: 1 }), exact };
}

export function widgetNumberAverage(total: string | number, count: number | null): number | null {
  if (!count || count <= 0) return null;
  const sum = Number(total);
  return Number.isFinite(sum) ? sum / count : null;
}

const NOUN_CAPITALIZING_LANGUAGES = new Set(["de"]);

export function inlineListLabel(label: string, locale: string): string {
  const language = locale.split("-")[0]?.toLowerCase() ?? "";
  if (NOUN_CAPITALIZING_LANGUAGES.has(language)) return label;
  return label
    .split(/(\s+)/)
    .map((word) => (/^\p{Lu}[\p{Lu}\d]+$/u.test(word) ? word : word.toLocaleLowerCase(locale)))
    .join("");
}
