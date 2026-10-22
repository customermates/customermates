export type AddressFormatPart = "street" | "postalCode" | "city" | "region";
export type AddressPostalCodeLabel = "postal" | "zip" | "pin" | "eircode";
export type AddressCityLabel = "city" | "district" | "post_town" | "suburb";
export type AddressRegionLabel =
  | "area"
  | "county"
  | "department"
  | "district"
  | "do_si"
  | "emirate"
  | "island"
  | "oblast"
  | "parish"
  | "prefecture"
  | "province"
  | "state";

export const ADDRESS_FORMAT_PARTS = ["street", "postalCode", "city", "region"] as const;
export const ADDRESS_POSTAL_CODE_LABELS = ["postal", "zip", "pin", "eircode"] as const;
export const ADDRESS_CITY_LABELS = ["city", "district", "post_town", "suburb"] as const;
export const ADDRESS_REGION_LABELS = [
  "area",
  "county",
  "department",
  "district",
  "do_si",
  "emirate",
  "island",
  "oblast",
  "parish",
  "prefecture",
  "province",
  "state",
] as const;

export type AddressRegionMetadata = {
  aliases?: string[];
  iso?: string;
  key: string;
  latin?: string;
  name?: string;
  zip?: string;
};

type AddressPostalCodeFormat = { examples: string[]; pattern: string; prefix?: string };

export type AddressCountryMetadata = {
  cityLabel?: AddressCityLabel;
  lines: AddressFormatPart[][];
  postalCode?: AddressPostalCodeFormat;
  postalCodeLabel?: AddressPostalCodeLabel;
  regionLabel?: AddressRegionLabel;
  regions?: AddressRegionMetadata[];
  required?: AddressFormatPart[];
};

export type AddressMetadata = {
  countries: Readonly<Record<string, AddressCountryMetadata>>;
  defaults: Required<Omit<AddressCountryMetadata, "postalCode" | "regions">>;
  source: { license: string; retrievedOn: string; url: string };
};

export type AddressCountryFormat = {
  countryCode: string | null;
  cityLabel: AddressCityLabel;
  lines: AddressFormatPart[][];
  postalCode: AddressPostalCodeFormat | null;
  postalCodeLabel: AddressPostalCodeLabel;
  regionLabel: AddressRegionLabel;
  regions: readonly AddressRegionMetadata[];
  required: readonly AddressFormatPart[];
};

export type AddressFormatSource = (countryCode: string | null) => AddressCountryFormat;

export function addressFormatSource(metadata: AddressMetadata): AddressFormatSource {
  const formats = new Map<string, AddressCountryFormat>();
  const fallback: AddressCountryFormat = {
    countryCode: null,
    cityLabel: metadata.defaults.cityLabel,
    lines: metadata.defaults.lines,
    postalCode: null,
    postalCodeLabel: metadata.defaults.postalCodeLabel,
    regionLabel: metadata.defaults.regionLabel,
    regions: [],
    required: metadata.defaults.required,
  };
  return (countryCode) => {
    if (!countryCode) return fallback;
    const cached = formats.get(countryCode);
    if (cached) return cached;
    const country = metadata.countries[countryCode];
    const format: AddressCountryFormat = country
      ? {
          countryCode,
          cityLabel: country.cityLabel ?? metadata.defaults.cityLabel,
          lines: country.lines,
          postalCode: country.postalCode ?? null,
          postalCodeLabel: country.postalCodeLabel ?? metadata.defaults.postalCodeLabel,
          regionLabel: country.regionLabel ?? metadata.defaults.regionLabel,
          regions: country.regions ?? [],
          required: country.required ?? metadata.defaults.required,
        }
      : { ...fallback, countryCode };
    formats.set(countryCode, format);
    return format;
  };
}
