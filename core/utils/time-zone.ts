import { z } from "zod";

import { DEFAULT_LOCALE } from "@/i18n/locale-registry";

export function isIanaTimeZone(timeZone: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(timeZone)) return false;
  try {
    return Boolean(new Intl.DateTimeFormat(DEFAULT_LOCALE, { timeZone }).resolvedOptions().timeZone);
  } catch {
    return false;
  }
}

export const TimeZoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isIanaTimeZone, "Use an IANA time zone such as Europe/Berlin");

export function browserTimeZone(): string {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return zone && isIanaTimeZone(zone) ? zone : "UTC";
  } catch {
    return "UTC";
  }
}
