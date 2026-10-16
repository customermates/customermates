import type { AddressLookupMatch } from "./address-lookup-provider";
import type { RecordAddress } from "@/features/records/record-model.schema";
import type { RecordAddressParts } from "@/features/records/record-address-lines";

const WORD_ALIASES: Readonly<Record<string, string>> = {
  str: "strasse",
  st: "street",
  rd: "road",
  ave: "avenue",
  av: "avenue",
  avda: "avenida",
  blvd: "boulevard",
  bd: "boulevard",
  dr: "drive",
  ln: "lane",
  ct: "court",
  pl: "place",
  sq: "square",
  hwy: "highway",
  pkwy: "parkway",
  c: "calle",
  r: "rue",
};

export function addressWords(value: string | null): string[] {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/ß/gu, "ss")
    .replace(/(\d)\s+([a-z])(?![\p{L}\p{N}])/gu, "$1$2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((word) => WORD_ALIASES[word] ?? (word.length > 3 && word.endsWith("str") ? `${word}asse` : word));
}

function sameWords(left: string | null, right: string | null): boolean {
  const a = addressWords(left).sort();
  const b = addressWords(right).sort();
  return a.length > 0 && a.length === b.length && a.every((word, index) => word === b[index]);
}

function sameCity(left: string, right: string): boolean {
  const a = addressWords(left).join(" ");
  const b = addressWords(right).join(" ");
  return Boolean(a && b) && (a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `));
}

function samePostalCode(left: string, right: string): boolean {
  return left.replace(/\s+/gu, "").toLowerCase() === right.replace(/\s+/gu, "").toLowerCase();
}

export function addressMatchesInput(input: RecordAddressParts, candidate: RecordAddress): boolean {
  if (!input.postalCode && !input.city) return false;
  if (input.countryCode && candidate.countryCode !== input.countryCode) return false;
  if (input.postalCode && !(candidate.postalCode && samePostalCode(input.postalCode, candidate.postalCode)))
    return false;
  if (input.city && !(candidate.city && sameCity(input.city, candidate.city))) return false;
  return input.street ? sameWords(input.street, candidate.street) : !candidate.street;
}

export function bestAddressMatch(
  input: RecordAddressParts,
  matches: readonly AddressLookupMatch[],
): AddressLookupMatch | null {
  return matches.find((match) => addressMatchesInput(input, match.address)) ?? null;
}
