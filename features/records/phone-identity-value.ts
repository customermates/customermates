import { normalizePhoneNumber } from "@/core/utils/phone-number";

export function renormalizedPhoneIdentityValue(value: string): string | null {
  const normalized =
    normalizePhoneNumber(value) ?? (value.startsWith("+00") ? normalizePhoneNumber(value.slice(1)) : null);
  return normalized && normalized !== value ? normalized : null;
}
