const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;

export type StorageUnit = (typeof UNITS)[number];

export type StorageSize = { value: number; unit: StorageUnit; maximumFractionDigits: number };

export function storageSize(bytes: number): StorageSize {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return { value, unit: UNITS[unit], maximumFractionDigits: unit === 0 || value >= 100 ? 0 : 1 };
}

export function storageSizeLabel(bytes: number, locale: string): string {
  const size = storageSize(bytes);
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: size.unit,
    unitDisplay: "short",
    maximumFractionDigits: size.maximumFractionDigits,
  }).format(size.value);
}
