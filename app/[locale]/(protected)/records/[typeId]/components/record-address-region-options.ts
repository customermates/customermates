import type { AddressCountryFormat } from "@/features/addresses/address-country-format";

import { addressRegionLabel, findAddressRegion, regionValue } from "@/features/addresses/address-region";

export type AddressRegionOption = { key: string; label: string };

export function addressRegionOptions(format: AddressCountryFormat, current: string | null): AddressRegionOption[] {
  const options = format.regions.map((region) => {
    const label = addressRegionLabel(region, true);
    return { key: regionValue(region, label), label };
  });
  if (current && !options.some((option) => option.key === current))
    return [{ key: current, label: current }, ...options];
  return options;
}

export function addressRegionOptionValue(format: AddressCountryFormat, value: string): string {
  const region = findAddressRegion(format, value);
  return region ? regionValue(region, addressRegionLabel(region, true)) : value;
}

export function addressRegionName(format: AddressCountryFormat | null, value: string): string {
  const region = format ? findAddressRegion(format, value) : null;
  return region ? addressRegionLabel(region, true) : value;
}
