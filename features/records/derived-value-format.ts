export const DERIVED_VALUE_FRACTION_DIGITS = 2;

export function derivedFractionDigits(decimalPlaces: number | null | undefined): number {
  return decimalPlaces ?? DERIVED_VALUE_FRACTION_DIGITS;
}
