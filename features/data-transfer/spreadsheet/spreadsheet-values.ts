import { z } from "zod";

import { DEFAULT_LOCALE, formattingTagFor } from "@/i18n/locale-registry";

import type { SpreadsheetCell, SpreadsheetDateOrder, SpreadsheetLocale } from "./spreadsheet.schema";

const GROUPING_CHARACTERS = /[\s  '’]/g;
const CURRENCY_SYMBOLS: ReadonlyArray<readonly [string, string]> = [
  ["€", "EUR"],
  ["$", "USD"],
  ["£", "GBP"],
  ["¥", "JPY"],
  ["₹", "INR"],
  ["Fr.", "CHF"],
];
const TRUE_WORDS = new Set(["true", "yes", "y", "1", "x", "ja", "j", "wahr", "✓", "✔", "on"]);
const FALSE_WORDS = new Set(["false", "no", "n", "0", "nein", "falsch", "off"]);
const DATE_PATTERN = /^(\d{1,4})([./-])(\d{1,2})\2(\d{1,4})\.?$/;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?\s*([ap]\.?m\.?)?$/i;
const OFFSET_PATTERN = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const NAME_PARTICLES = new Set([
  "da",
  "das",
  "de",
  "del",
  "della",
  "den",
  "der",
  "des",
  "di",
  "dos",
  "du",
  "la",
  "le",
  "ten",
  "ter",
  "van",
  "von",
  "zu",
]);

export function cellIsEmpty(cell: SpreadsheetCell): boolean {
  return cell === null || (typeof cell === "string" && cell.trim() === "");
}

export function cellText(cell: SpreadsheetCell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return numberToDecimal(cell) ?? String(cell);
  return String(cell).trim();
}

export function canonicalDecimal(sign: string, integer: string, fraction: string): string | null {
  if (!/^\d+$/.test(integer) || (fraction && !/^\d+$/.test(fraction))) return null;
  const whole = integer.replace(/^0+(?=\d)/, "");
  const value = fraction ? `${whole}.${fraction}` : whole;
  return sign === "-" && /[1-9]/.test(value) ? `-${value}` : value;
}

export function numberToDecimal(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const text = /e/i.test(String(value))
    ? value.toLocaleString(formattingTagFor(DEFAULT_LOCALE), { useGrouping: false, maximumFractionDigits: 20 })
    : String(value);
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text);
  return match ? canonicalDecimal(match[1], match[2], match[3] ?? "") : null;
}

export function numberConvention(locale: SpreadsheetLocale): { decimal: string; grouping: string } {
  const parts = new Intl.NumberFormat(formattingTagFor(locale)).formatToParts(1234567.5);
  const decimal = parts.find((part) => part.type === "decimal")?.value ?? ".";
  const group = parts.find((part) => part.type === "group")?.value ?? "";
  return { decimal, grouping: group && !/\s/.test(group) ? group : decimal === "," ? "." : "," };
}

export function parseDecimalText(input: string, locale: SpreadsheetLocale): string | null {
  const text = input.replace(GROUPING_CHARACTERS, "");
  const match = /^([+-]?)([\d.,]+)$/.exec(text);
  if (!match) return null;
  const [, sign, body] = match;
  const { decimal, grouping } = numberConvention(locale);
  if (body.includes(decimal)) {
    const [integer, fraction, extra] = body.split(decimal);
    if (extra !== undefined || !fraction) return null;
    if (integer.includes(grouping) && !new RegExp(`^\\d{1,3}(\\${grouping}\\d{3})+$`).test(integer)) return null;
    return canonicalDecimal(sign, integer.split(grouping).join(""), fraction);
  }
  if (!body.includes(grouping)) return canonicalDecimal(sign, body, "");
  if (new RegExp(`^\\d{1,3}(\\${grouping}\\d{3})+$`).test(body))
    return canonicalDecimal(sign, body.split(grouping).join(""), "");
  const parts = body.split(grouping);
  return parts.length === 2 ? canonicalDecimal(sign, parts[0], parts[1]) : null;
}

export function parseSpreadsheetNumber(cell: SpreadsheetCell, locale: SpreadsheetLocale): string | null {
  if (typeof cell === "number") return numberToDecimal(cell);
  if (typeof cell !== "string") return null;
  return parseDecimalText(cell.trim(), locale);
}

export function parseSpreadsheetCurrency(
  cell: SpreadsheetCell,
  locale: SpreadsheetLocale,
): { value: string; currency: string | null } | null {
  if (typeof cell === "number") {
    const value = numberToDecimal(cell);
    return value === null ? null : { value, currency: null };
  }
  if (typeof cell !== "string") return null;
  let text = cell.trim();
  let currency: string | null = null;
  const code = /^([A-Z]{3})\s*(?=[\d+-])|(?<=\d)\s*([A-Z]{3})$/.exec(text);
  if (code) {
    currency = code[1] ?? code[2];
    text = text.replace(code[0], "");
  } else {
    for (const [symbol, iso] of CURRENCY_SYMBOLS) {
      if (text.startsWith(symbol) || text.endsWith(symbol)) {
        currency = iso;
        text = text.startsWith(symbol) ? text.slice(symbol.length) : text.slice(0, -symbol.length);
        break;
      }
    }
  }
  const value = parseDecimalText(text.trim(), locale);
  return value === null ? null : { value, currency };
}

export function parseSpreadsheetBoolean(cell: SpreadsheetCell): boolean | null {
  if (typeof cell === "boolean") return cell;
  if (typeof cell === "number") return cell === 1 ? true : cell === 0 ? false : null;
  if (typeof cell !== "string") return null;
  const word = cell.trim().toLowerCase();
  if (TRUE_WORDS.has(word)) return true;
  if (FALSE_WORDS.has(word)) return false;
  return null;
}

function validDate(year: number, month: number, day: number): string | null {
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(2000, month - 1, day));
  date.setUTCFullYear(year);
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fullYear(text: string): number | null {
  if (text.length === 4) return Number(text);
  if (text.length !== 2) return null;
  const short = Number(text);
  return short < 30 ? 2000 + short : 1900 + short;
}

export function defaultDateOrder(locale: SpreadsheetLocale): SpreadsheetDateOrder {
  const order = new Intl.DateTimeFormat(formattingTagFor(locale), {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .formatToParts(new Date(Date.UTC(2026, 11, 31)))
    .flatMap((part) => (part.type === "day" || part.type === "month" || part.type === "year" ? [part.type[0]] : []))
    .join("");
  return order === "mdy" || order === "ymd" ? order : "dmy";
}

export function parseDateText(input: string, locale: SpreadsheetLocale, order?: SpreadsheetDateOrder): string | null {
  const text = input.trim();
  const iso = ISO_DATE_PATTERN.exec(text);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const match = DATE_PATTERN.exec(text);
  if (!match) return null;
  const [, first, , second, third] = match;
  const effective = first.length === 4 ? "ymd" : (order ?? defaultDateOrder(locale));
  if (effective === "ymd") {
    const year = fullYear(first);
    return year === null || third.length > 2 ? null : validDate(year, Number(second), Number(third));
  }
  if (first.length > 2) return null;
  const year = fullYear(third);
  if (year === null) return null;
  return effective === "dmy"
    ? validDate(year, Number(second), Number(first))
    : validDate(year, Number(first), Number(second));
}

function splitDateTime(text: string): { date: string; time: string | null } {
  const isoLike = /^(\d{4}-\d{2}-\d{2})[T\s](.+)$/.exec(text);
  if (isoLike) return { date: isoLike[1], time: isoLike[2].trim() };
  const separated = /^(\S+?),?\s+(.+)$/.exec(text);
  if (separated) return { date: separated[1], time: separated[2].trim() };
  return { date: text, time: null };
}

function zoneOffsetMinutes(utcMillis: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat(formattingTagFor(DEFAULT_LOCALE), {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMillis));
  const part = (type: string) => Number(parts.find((entry) => entry.type === type)?.value ?? 0);
  const wall = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return Math.round((wall - Math.floor(utcMillis / 1000) * 1000) / 60000);
}

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? "-" : "+";
  const absolute = Math.abs(minutes);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}

function wallClockInstant(date: string, hour: number, minute: number, second: number, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const wall = new Date(Date.UTC(2000, month - 1, day, hour, minute, second));
  wall.setUTCFullYear(year);
  const guess = wall.getTime();
  let offset = zoneOffsetMinutes(guess, timeZone);
  const corrected = zoneOffsetMinutes(guess - offset * 60000, timeZone);
  if (corrected !== offset) offset = corrected;
  const clock = [hour, minute, second].map((part) => String(part).padStart(2, "0")).join(":");
  return `${date}T${clock}${formatOffset(offset)}`;
}

export function parseDateTimeText(
  input: string,
  locale: SpreadsheetLocale,
  timeZone: string,
  order?: SpreadsheetDateOrder,
): string | null {
  const text = input.trim();
  if (OFFSET_PATTERN.test(text) && /^\d{4}-\d{2}-\d{2}T/.test(text)) {
    const normalized = text.replace(/([+-]\d{2})(\d{2})$/, "$1:$2").replace(/z$/, "Z");
    const parsed = z.iso.datetime({ offset: true }).safeParse(normalized);
    return parsed.success && !/\.\d{7}/.test(normalized) && !Number.isNaN(Date.parse(normalized)) ? normalized : null;
  }
  const { date: datePart, time } = splitDateTime(text);
  const date = parseDateText(datePart, locale, order);
  if (!date) return null;
  if (!time) return wallClockInstant(date, 0, 0, 0, timeZone);
  const clock = TIME_PATTERN.exec(time);
  if (!clock) return null;
  let hour = Number(clock[1]);
  const minute = Number(clock[2]);
  const second = Number(clock[3] ?? 0);
  const meridiem = clock[5]?.replace(/\./g, "").toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (meridiem === "pm" ? 12 : 0);
  }
  if (hour > 23 || minute > 59 || second > 59) return null;
  return wallClockInstant(date, hour, minute, second, timeZone);
}

export function dateTextHasTime(input: string): boolean {
  return splitDateTime(input.trim()).time !== null;
}

export function normalizePhone(input: string, countryCode?: string): string | null {
  let text = input.trim().replace(/\(0\)/g, "");
  text = text.replace(/[\s ().\/-]/g, "");
  if (text.startsWith("00")) text = `+${text.slice(2)}`;
  if (!text.startsWith("+")) {
    if (!countryCode || !text.startsWith("0")) return null;
    text = `+${countryCode}${text.replace(/^0+/, "")}`;
  }
  return z.e164().safeParse(text).success ? text : null;
}

export function normalizeEmail(input: string): string | null {
  const text = input.trim().replace(/^mailto:/i, "");
  return z.email().safeParse(text).success ? text : null;
}

export function normalizeUrl(input: string): string | null {
  const text = input.trim();
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
    ? text
    : /^(?:www\.)?[\p{L}\d-]+(?:\.[\p{L}\d-]+)*\.[\p{L}]{2,}(?:[/?#]\S*)?$/u.test(text)
      ? `https://${text}`
      : null;
  if (!candidate) return null;
  try {
    return ["http:", "https:"].includes(new URL(candidate).protocol) ? candidate : null;
  } catch {
    return null;
  }
}

export function looksLikePhone(input: string): boolean {
  const text = input.trim();
  if (!/^\+?[\d\s ().\/-]+$/.test(text)) return false;
  const digits = text.replace(/\D/g, "").length;
  if (digits < 7 || digits > 15) return false;
  return text.startsWith("+") || text.startsWith("0") || /[\s().\/-]/.test(text);
}

export function matchOptionKey(input: string): string {
  return input.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
}

export function splitListValues(input: string, separators: RegExp): string[] {
  return input
    .split(separators)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function splitPersonName(input: string): { first: string; last: string } {
  const text = input.replace(/\s+/g, " ").trim();
  const comma = text.indexOf(",");
  if (comma >= 0) return { first: text.slice(comma + 1).trim(), last: text.slice(0, comma).trim() };
  const words = text.split(" ");
  if (words.length < 2) return { first: text, last: "" };
  const particle = words.findIndex((word, index) => index > 0 && index < words.length - 1 && NAME_PARTICLES.has(word));
  const lastStart = particle > 0 ? particle : words.length - 1;
  return { first: words.slice(0, lastStart).join(" "), last: words.slice(lastStart).join(" ") };
}
