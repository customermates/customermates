import { isSupportedCountry, parsePhoneNumberFromString } from "libphonenumber-js/min";

export function normalizePhoneNumber(raw: string, region?: string | null, defaultCallingCode?: string): string | null {
  const text = raw.trim().replace(/^00(?=[\s\d]*[1-9])/, "+");
  if (!text) return null;
  const country = region?.toUpperCase() ?? "";
  const parsed = parsePhoneNumberFromString(text, {
    extract: false,
    ...(isSupportedCountry(country) ? { defaultCountry: country } : defaultCallingCode ? { defaultCallingCode } : {}),
  });
  return parsed?.isValid() && !parsed.ext ? parsed.number : null;
}
