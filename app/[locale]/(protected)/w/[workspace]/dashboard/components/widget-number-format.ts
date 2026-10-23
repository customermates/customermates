export const WIDGET_NUMBER_COMPACT_FROM = 10_000;

export const WIDGET_CURRENCY_WHOLE_FROM = 1_000;

const AXIS_COMPACT_FRACTION_DIGITS = 2;

type DecimalFormat = (
  value: string | number,
  options: { currency?: string | null; compact?: boolean; maximumFractionDigits?: number },
) => string;

type WidgetNumberOptions = { currency: string | null; fractionDigits: number; integer?: boolean };

type WidgetAmountOptions = { currency: string | null; fractionDigits?: number };

export type WidgetNumberText = { display: string; exact: string };

function digitsOf(text: string): string {
  return text.replace(/\D/gu, "");
}

function wholeOrCompact(
  value: string | number,
  currency: string | null,
  maximumFractionDigits: number,
  decimal: DecimalFormat,
): string {
  const whole = decimal(value, { currency, maximumFractionDigits: 0 });
  const abbreviated = decimal(Number(value), { currency, compact: true, maximumFractionDigits: 0 });
  if (digitsOf(abbreviated) === digitsOf(whole)) return whole;
  return decimal(Number(value), { currency, compact: true, maximumFractionDigits });
}

function isWholeAmount(value: string | number, currency: string | null): boolean {
  const magnitude = Math.abs(Number(value));
  return Boolean(currency) && Number.isFinite(magnitude) && magnitude >= WIDGET_CURRENCY_WHOLE_FROM;
}

export function formatWidgetAmount(
  value: string | number,
  { currency, fractionDigits }: WidgetAmountOptions,
  decimal: DecimalFormat,
): string {
  if (isWholeAmount(value, currency)) return decimal(value, { currency, maximumFractionDigits: 0 });
  return decimal(value, { currency, maximumFractionDigits: fractionDigits });
}

export function formatWidgetAxisValue(value: string | number, currency: string | null, decimal: DecimalFormat): string {
  const magnitude = Math.abs(Number(value));
  if (!Number.isFinite(magnitude) || magnitude < WIDGET_CURRENCY_WHOLE_FROM)
    return decimal(value, { currency, compact: true, maximumFractionDigits: AXIS_COMPACT_FRACTION_DIGITS });
  return wholeOrCompact(value, currency, AXIS_COMPACT_FRACTION_DIGITS, decimal);
}

export function formatWidgetNumber(
  value: string | number,
  { currency, fractionDigits, integer = false }: WidgetNumberOptions,
  decimal: DecimalFormat,
): WidgetNumberText {
  const exact = decimal(value, { currency, maximumFractionDigits: integer ? 0 : fractionDigits });
  const magnitude = Math.abs(Number(value));
  if (integer || !Number.isFinite(magnitude)) return { display: exact, exact };
  if (magnitude < WIDGET_NUMBER_COMPACT_FROM)
    return { display: formatWidgetAmount(value, { currency, fractionDigits }, decimal), exact };
  return { display: wholeOrCompact(value, currency, 1, decimal), exact };
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
