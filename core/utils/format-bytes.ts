const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];

export type FormatNumber = (value: number | undefined, options?: { maximumFractionDigits?: number }) => string;

export function formatBytes(size: number | null | undefined, formatNumber?: FormatNumber): string | null {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) return null;
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 || value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  const formatted = formatNumber ? formatNumber(rounded, { maximumFractionDigits: 1 }) : String(rounded);
  return `${formatted} ${BYTE_UNITS[unit]}`;
}

export function fileSizeLabel(bytes: number, locale: string): string {
  const formatNumber: FormatNumber = (value, options) => new Intl.NumberFormat(locale, options).format(value ?? 0);
  return formatBytes(bytes, formatNumber) ?? `${formatNumber(0)} B`;
}
