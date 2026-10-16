import type { AddressCountryFormat, AddressFormatPart } from "./address-country-format";
import type { AddressCheckResult } from "./address-check.schema";

import { cityWords } from "./address-check";

export type AddressFormPart = AddressFormatPart | "line2";
export type AddressFormParts = Record<AddressFormPart | "countryCode", string | null>;

const GENERIC_LINES: AddressFormatPart[][] = [["street"], ["postalCode", "city"], ["region"]];
const MAX_PLACE_CHOICES = 5;

function filled(parts: AddressFormParts, part: AddressFormatPart): boolean {
  return Boolean(parts[part]?.trim());
}

function shown(format: AddressCountryFormat, parts: AddressFormParts, part: AddressFormatPart): boolean {
  if (part === "street" || part === "city" || filled(parts, part)) return true;
  if (part === "postalCode") return Boolean(format.postalCode) || format.lines.some((line) => line.includes(part));
  return format.regions.length > 0 || format.lines.some((line) => line.includes(part));
}

export function addressFormRows(format: AddressCountryFormat | null, parts: AddressFormParts): AddressFormPart[][] {
  const lines = format?.countryCode ? format.lines : GENERIC_LINES;
  const rows: AddressFormPart[][] = [];
  const placed = new Set<AddressFormatPart>();
  for (const line of lines) {
    const row = line.filter((part) => !placed.has(part) && (!format?.countryCode || shown(format, parts, part)));
    for (const part of row) placed.add(part);
    if (!row.length) continue;
    rows.push(row);
    if (row.includes("street")) rows.push(["line2"]);
  }
  for (const part of ["street", "postalCode", "city", "region"] as const) {
    if (placed.has(part) || (format?.countryCode && !shown(format, parts, part))) continue;
    rows.push([part]);
    if (part === "street") rows.push(["line2"]);
  }
  return rows;
}

export type AddressPlaceChoice = { city: string; region: string | null };

export function addressPlaceChoices(result: AddressCheckResult): AddressPlaceChoice[] {
  if (result.postalCode.status !== "ready") return [];
  const seen = new Set<string>();
  const choices: AddressPlaceChoice[] = [];
  for (const place of result.postalCode.places) {
    if (!place.city) continue;
    const key = cityWords(place.city).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push({ city: place.city, region: place.region });
  }
  return choices.slice(0, MAX_PLACE_CHOICES);
}

export function addressAutofill(
  result: AddressCheckResult,
  parts: AddressFormParts,
  format: AddressCountryFormat | null,
): Partial<Pick<AddressFormParts, "city" | "region">> | null {
  if (result.postalCode.match !== "exact" || filled(parts, "city")) return null;
  const choices = addressPlaceChoices(result);
  if (choices.length !== 1) return null;
  const [choice] = choices;
  const region = !filled(parts, "region") && format?.regions.length && choice.region ? choice.region : null;
  return { city: choice.city, ...(region ? { region } : {}) };
}
