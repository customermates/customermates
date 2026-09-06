import { z } from "zod";

const OFFSET_DATE_TIME = z.iso.datetime({ offset: true });

export function isIsoDateTime(value: unknown): value is string {
  return OFFSET_DATE_TIME.safeParse(value).success;
}

export function canonicalIsoDateTime(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
}

export function canonicalIsoDateTimeIfValid(value: string | null | undefined): string | null | undefined {
  if (typeof value !== "string" || !isIsoDateTime(value)) return value;
  return canonicalIsoDateTime(value);
}
