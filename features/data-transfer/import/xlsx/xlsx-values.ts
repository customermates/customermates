import type { RecordFieldView, RecordRef, RecordScalar } from "@/features/records/record-model.schema";
import type { XlsxCell } from "./xlsx-workbook";

import { normalizePhoneNumber, scalarMatchesType } from "@/features/records/record-model-validation";
import { addressFromText } from "@/features/records/record-address-value";

import { normalizeXlsxHeader } from "./xlsx-mapping";
import { xlsxCellText } from "./xlsx-workbook";

export type XlsxIssueCode =
  | "required"
  | "invalidNumber"
  | "currencyMismatch"
  | "invalidDate"
  | "invalidBoolean"
  | "invalidEmail"
  | "invalidUrl"
  | "invalidPhone"
  | "invalidValue"
  | "unknownOption"
  | "unknownMember"
  | "ambiguousMember"
  | "unknownRecord"
  | "ambiguousRecord"
  | "tooManyValues"
  | "invalidRecordId"
  | "noMatch"
  | "ambiguousMatch"
  | "duplicateMatch"
  | "missingMatchValue"
  | "restricted"
  | "lookupUnavailable"
  | "fileNotImportable";

type XlsxParsed<T> = { ok: true; value: T } | { ok: false; code: XlsxIssueCode; value?: string };

export type XlsxMember = { id: string; email: string; name: string };

export type XlsxRecordIndex = {
  byTitle: Map<string, RecordRef[]>;
  byId: Map<string, RecordRef>;
  complete: boolean;
};

const DAY_MS = 86_400_000;

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CURRENCY_SYMBOLS: Record<string, string> = { "€": "EUR", $: "USD", "£": "GBP", "¥": "JPY", "₹": "INR" };

const TRUE_WORDS = ["true", "yes", "y", "1", "x", "ja", "j", "oui", "si", "wahr", "vrai", "vero", "verdadero"];

const FALSE_WORDS = ["false", "no", "n", "0", "nein", "non", "falsch", "faux", "falso"];

function ok<T>(value: T): XlsxParsed<T> {
  return { ok: true, value };
}

function issue<T>(code: XlsxIssueCode, value?: string): XlsxParsed<T> {
  return value === undefined ? { ok: false, code } : { ok: false, code, value };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

function utcDate(date: Date): string {
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function validDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

export function excelSerialDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1 || serial >= 2_958_466) return null;
  return new Date(EXCEL_EPOCH_MS + Math.round(serial * DAY_MS));
}

function expandYear(year: number): number {
  return year < 100 ? 2000 + year : year;
}

export function parseXlsxDate(cell: XlsxCell): { date: Date; hasTime: boolean } | null {
  if (cell instanceof Date) return { date: cell, hasTime: cell.getTime() % DAY_MS !== 0 };
  if (typeof cell === "number") {
    const date = excelSerialDate(cell);
    return date ? { date, hasTime: !Number.isInteger(cell) } : null;
  }
  const text = xlsxCellText(cell);
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return parseXlsxDate(Number(text));
  const time = /(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/;
  const iso = new RegExp(`^(\\d{4})-(\\d{1,2})-(\\d{1,2})${time.source}`).exec(
    text.replace(/(?:Z|[+-]\d{2}:?\d{2}| UTC)$/, ""),
  );
  if (iso && /(?:Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : { date: parsed, hasTime: true };
  }
  const dotted = new RegExp(`^(\\d{1,2})\\.(\\d{1,2})\\.(\\d{2,4})${time.source}`).exec(text);
  const slashed = new RegExp(`^(\\d{1,2})/(\\d{1,2})/(\\d{2,4})${time.source}`).exec(text);
  let parts: number[] | null = null;
  let clock: Array<string | undefined> = [];
  if (iso) {
    parts = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    clock = iso.slice(4);
  } else if (dotted) {
    parts = [expandYear(Number(dotted[3])), Number(dotted[2]), Number(dotted[1])];
    clock = dotted.slice(4);
  } else if (slashed) {
    const first = Number(slashed[1]);
    const second = Number(slashed[2]);
    parts =
      first > 12 ? [expandYear(Number(slashed[3])), second, first] : [expandYear(Number(slashed[3])), first, second];
    clock = slashed.slice(4);
  }
  if (!parts) return null;
  const [hour, minute, second] = clock.map((value) => Number(value ?? 0));
  const date = validDate(parts[0], parts[1], parts[2], hour, minute, second);
  return date ? { date, hasTime: clock[0] !== undefined } : null;
}

export function parseXlsxDecimal(cell: XlsxCell): { value: string; currency: string | null } | null {
  if (typeof cell === "number") {
    if (!Number.isFinite(cell)) return null;
    const text = Math.abs(cell) < 1e21 ? cell.toFixed(10).replace(/\.?0+$/, "") : null;
    return text === null ? null : { value: text === "-0" ? "0" : text, currency: null };
  }
  if (typeof cell !== "string") return null;
  let text = cell.trim();
  let currency: string | null = null;
  const code = /(?:^|\s)([A-Z]{3})(?:\s|$)/.exec(text);
  if (code) {
    currency = code[1];
    text = text.replace(code[1], "");
  }
  for (const [symbol, iso] of Object.entries(CURRENCY_SYMBOLS)) {
    if (!text.includes(symbol)) continue;
    currency = currency ?? iso;
    text = text.replace(symbol, "");
  }
  text = text.replace(/[\s  ']/g, "");
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/^[(-]+|\)$/g, "");
  if (!/^[\d.,]+$/.test(text)) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    const decimal = lastComma > lastDot ? "," : ".";
    const group = decimal === "," ? "." : ",";
    normalized = text.split(group).join("").replace(decimal, ".");
  } else if (lastComma >= 0) {
    normalized =
      /^\d{1,3}(?:,\d{3})+$/.test(text) && text.split(",").length > 2
        ? text.split(",").join("")
        : text.replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3}){2,}$/.test(text)) normalized = text.split(".").join("");
  else normalized = text;

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const trimmed = normalized
    .replace(/^0+(?=\d)/, "")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
  return { value: negative && trimmed !== "0" ? `-${trimmed}` : trimmed, currency };
}

export function parseXlsxBoolean(cell: XlsxCell): boolean | null {
  if (typeof cell === "boolean") return cell;
  if (typeof cell === "number") return cell === 1 ? true : cell === 0 ? false : null;
  const text = normalizeXlsxHeader(xlsxCellText(cell));
  if (TRUE_WORDS.includes(text) || xlsxCellText(cell) === "✓") return true;
  if (FALSE_WORDS.includes(text)) return false;
  return null;
}

function splitXlsxList(text: string, separators: RegExp = /[\n;,]/): string[] {
  return text
    .split(separators)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function plainTextDocument(text: string): string {
  const paragraphs = text.replace(/\r\n?/g, "\n").split("\n");
  return JSON.stringify({
    type: "doc",
    content: paragraphs.map((paragraph) =>
      paragraph ? { type: "paragraph", content: [{ type: "text", text: paragraph }] } : { type: "paragraph" },
    ),
  });
}

function textScalar(text: string, field: RecordFieldView): XlsxParsed<string> {
  const value = field.valueType === "phone" ? normalizePhoneNumber(text) : text;
  if (scalarMatchesType({ kind: "text", value }, field.valueType)) return ok(value);
  if (field.valueType === "email") return issue("invalidEmail", text);
  if (field.valueType === "url") return issue("invalidUrl", text);
  if (field.valueType === "phone") return issue("invalidPhone", text);
  return issue("invalidValue", text);
}

function optionId(text: string, field: RecordFieldView): string | null {
  const normalized = normalizeXlsxHeader(text);
  const match =
    field.options.find((option) => option.label === text || option.id === text) ??
    field.options.find((option) => normalizeXlsxHeader(option.label) === normalized);
  return match?.id ?? null;
}

function dateScalar(cell: XlsxCell, kind: "date" | "dateTime"): XlsxParsed<string> {
  const parsed = parseXlsxDate(cell);
  if (!parsed) return issue("invalidDate", xlsxCellText(cell));
  return ok(kind === "date" ? utcDate(parsed.date) : parsed.date.toISOString());
}

export function parseXlsxRangePart(cell: XlsxCell, field: RecordFieldView): XlsxParsed<string | null> {
  if (!xlsxCellText(cell)) return ok(null);
  return dateScalar(cell, field.valueType === "dateRange" ? "date" : "dateTime");
}

function rangeScalar(cell: XlsxCell, kind: "date" | "dateTime"): XlsxParsed<RecordScalar> {
  const text = xlsxCellText(cell);
  const parts = text.split(/\s+(?:\/|–|-|to|bis)\s+|\s*\/\s*(?=\d{4}-)/).map((part) => part.trim());
  if (parts.length !== 2) return issue("invalidDate", text);
  const [start, end] = parts.map((part) => (part ? dateScalar(part, kind) : ok("")));
  if (!start.ok || !end.ok) return issue("invalidDate", text);
  return ok({ kind: "range", start: start.value || null, end: end.value || null });
}

function parseXlsxMember(text: string, members: XlsxMember[]): XlsxParsed<string> {
  const lower = text.trim().toLocaleLowerCase("en");
  const byEmail = members.filter((member) => member.email.toLocaleLowerCase("en") === lower);
  if (byEmail.length === 1) return ok(byEmail[0].id);
  const normalized = normalizeXlsxHeader(text);
  const byName = members.filter((member) => normalizeXlsxHeader(member.name) === normalized || member.id === text);
  if (byName.length === 1) return ok(byName[0].id);
  return issue(byName.length > 1 ? "ambiguousMember" : "unknownMember", text);
}

export function parseXlsxFieldCell(
  cell: XlsxCell,
  field: RecordFieldView,
  members: XlsxMember[] | null,
): XlsxParsed<RecordScalar | null> {
  const text = xlsxCellText(cell);
  if (cell === null || (typeof cell === "string" && !text)) return ok(null);
  switch (field.valueType) {
    case "number":
    case "currency": {
      const parsed = parseXlsxDecimal(cell);
      if (!parsed) return issue("invalidNumber", text);
      if (field.valueType === "number") return ok({ kind: "decimal", value: parsed.value, currency: null });
      const currency = field.format?.currency ?? parsed.currency;
      if (!currency) return issue("invalidNumber", text);
      if (parsed.currency && parsed.currency !== currency) return issue("currencyMismatch", text);
      return ok({ kind: "decimal", value: parsed.value, currency });
    }
    case "boolean": {
      const value = parseXlsxBoolean(cell);
      return value === null ? issue("invalidBoolean", text) : ok({ kind: "boolean", value });
    }
    case "date":
    case "dateTime": {
      const parsed = dateScalar(cell, field.valueType);
      return parsed.ok ? ok({ kind: field.valueType, value: parsed.value }) : parsed;
    }
    case "dateRange":
    case "dateTimeRange":
      return rangeScalar(cell, field.valueType === "dateRange" ? "date" : "dateTime");
    case "select": {
      if (!field.multiple) {
        const id = optionId(text, field);
        return id ? ok({ kind: "select", value: id }) : issue("unknownOption", text);
      }
      const ids: string[] = [];
      for (const part of splitXlsxList(text)) {
        const id = optionId(part, field);
        if (!id) return issue("unknownOption", part);
        if (!ids.includes(id)) ids.push(id);
      }
      return ids.length > 100
        ? issue("tooManyValues", text)
        : ok(ids.length ? { kind: "selectList", value: ids } : null);
    }
    case "member": {
      if (!members) return issue("lookupUnavailable", text);
      const parsed = parseXlsxMember(text, members);
      return parsed.ok ? ok({ kind: "member", value: parsed.value }) : parsed;
    }
    case "richText":
      return ok({ kind: "richText", documentJson: plainTextDocument(text) });
    case "address": {
      const address = addressFromText(text);
      return ok(address && { kind: "address", value: address });
    }
    case "file":
      return issue("fileNotImportable", text);
    case "text":
    case "email":
    case "phone":
    case "url": {
      if (!field.multiple) {
        const parsed = textScalar(text, field);
        return parsed.ok ? ok({ kind: "text", value: parsed.value }) : parsed;
      }
      const values: string[] = [];
      for (const part of splitXlsxList(text, field.valueType === "text" ? /\n|,\s/ : /[\n;,]/)) {
        const parsed = textScalar(part, field);
        if (!parsed.ok) return parsed;
        values.push(parsed.value);
      }
      return values.length > 100
        ? issue("tooManyValues", text)
        : ok(values.length ? { kind: "textList", value: values } : null);
    }
    default:
      return issue("invalidValue", text);
  }
}

export function parseXlsxRelationshipCell(cell: XlsxCell, index: XlsxRecordIndex | null): XlsxParsed<RecordRef[]> {
  const text = xlsxCellText(cell);
  if (!text) return ok([]);
  if (!index) return issue("lookupUnavailable", text);
  const refs: RecordRef[] = [];
  for (const part of splitXlsxList(text, /[\n;]/).flatMap((value) =>
    index.byTitle.has(normalizeXlsxHeader(value)) ? [value] : splitXlsxList(value, /,/),
  )) {
    const byId = UUID.test(part) ? index.byId.get(part.toLowerCase()) : undefined;
    const matches = byId ? [byId] : (index.byTitle.get(normalizeXlsxHeader(part)) ?? []);
    if (matches.length === 0) return issue("unknownRecord", part);
    if (matches.length > 1) return issue("ambiguousRecord", part);
    if (!refs.some((ref) => ref.recordId === matches[0].recordId)) refs.push(matches[0]);
  }
  return ok(refs);
}

export function parseXlsxMembersCell(cell: XlsxCell, members: XlsxMember[] | null): XlsxParsed<string[]> {
  const text = xlsxCellText(cell);
  if (!text) return ok([]);
  if (!members) return issue("lookupUnavailable", text);
  const ids: string[] = [];
  for (const part of splitXlsxList(text)) {
    const parsed = parseXlsxMember(part, members);
    if (!parsed.ok) return parsed;
    if (!ids.includes(parsed.value)) ids.push(parsed.value);
  }
  return ok(ids);
}

export function parseXlsxRecordId(cell: XlsxCell): XlsxParsed<string | null> {
  const text = xlsxCellText(cell);
  if (!text) return ok(null);
  return UUID.test(text) ? ok(text.toLowerCase()) : issue("invalidRecordId", text);
}
