import { createHash } from "node:crypto";

import type { RecordExport, RecordExportLink } from "@/features/data-transfer/record-transfer.schema";
import type { RecordDto, RecordField, RecordModel, RecordScalar } from "@/features/records/record-model.schema";
import type { RecordIdentity } from "@/features/records/record-identity.schema";
import type {
  SpreadsheetCell,
  SpreadsheetColumnMapping,
  SpreadsheetMapping,
  SpreadsheetMappingIssue,
  SpreadsheetRowError,
  SpreadsheetRowErrorCode,
  SpreadsheetTable,
} from "./spreadsheet.schema";

import { parseMarkdownToJSON } from "@/components/editor/editor.utils";
import { channelClass } from "@/ee/messaging/provider";
import { RECORD_IMPORT_LIMIT, RECORD_IMPORT_LINK_LIMIT } from "@/features/data-transfer/record-transfer.schema";
import { RecordScalarSchema } from "@/features/records/record-model.schema";
import { scalarMatchesType } from "@/features/records/record-model-validation";
import {
  cellIsEmpty,
  cellText,
  loneNameParts,
  matchOptionKey,
  normalizeEmail,
  normalizePhone,
  normalizeUrl,
  parseDateText,
  parseDateTimeText,
  parseSpreadsheetBoolean,
  parseSpreadsheetCurrency,
  parseSpreadsheetNumber,
  splitListValues,
  splitPersonName,
} from "./spreadsheet-values";

export const SPREADSHEET_DOCUMENT_TIME = "1970-01-01T00:00:00.000Z";
const MAX_LIST_VALUES = 100;
const CONTACT_SEPARATORS = /[\n;,]/;
const OPTION_SEPARATORS = /[\n;,]/;
const RELATED_SEPARATORS = /[\n;]/;
const UNSUPPORTED_VALUE_TYPES = new Set<RecordField["valueType"]>(["member", "dateRange", "dateTimeRange"]);

export type SpreadsheetRelatedRecords = Map<string, Map<string, string[]>>;

export type SpreadsheetConversion = {
  documents: RecordExport[];
  rowCount: number;
  convertedRows: number;
  ignoredValues: number;
  errors: SpreadsheetRowError[];
};

type Converted = { value: RecordScalar | null } | { error: SpreadsheetRowErrorCode };

export function spreadsheetRecordId(idempotencyKey: string, key: string): string {
  const hash = createHash("sha256").update(`customermates:spreadsheet-import:${idempotencyKey}:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-8${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export function importableSpreadsheetField(field: RecordField): boolean {
  return !field.archived && field.behavior.kind === "input" && !UNSUPPORTED_VALUE_TYPES.has(field.valueType);
}

function inputFields(model: RecordModel, typeId: string): RecordField[] {
  return model.fields
    .filter(
      (field) =>
        field.typeId === typeId && !field.archived && field.behavior.kind === "input" && field.valueType !== "channels",
    )
    .sort((left, right) => left.position - right.position);
}

function fieldDefault(field: RecordField): RecordScalar | null {
  return field.behavior.kind === "input" ? (field.behavior.defaultValue ?? null) : null;
}

export function spreadsheetMappingIssues(
  headers: string[],
  mapping: SpreadsheetMapping,
  model: RecordModel,
): SpreadsheetMappingIssue[] {
  const issues: SpreadsheetMappingIssue[] = [];
  const columns = new Set(headers);
  const type = model.types.find((candidate) => candidate.id === mapping.typeId);
  if (!type || type.archived || type.embedded) return [{ code: "typeNotImportable", path: ["typeId"] }];
  const mapped = new Set<string>();
  mapping.columns.forEach((entry, index) => {
    if (!columns.has(entry.column)) issues.push({ code: "unknownColumn", path: ["columns", index, "column"] });
    const field = model.fields.find((candidate) => candidate.id === entry.fieldId);
    if (!field || field.typeId !== type.id || !importableSpreadsheetField(field))
      issues.push({ code: "fieldNotImportable", path: ["columns", index, "fieldId"] });
    else if (mapped.has(field.id) && field.valueType !== "channels")
      issues.push({ code: "duplicateField", path: ["columns", index, "fieldId"] });
    else if (entry.namePart && (field.valueType !== "text" || field.multiple))
      issues.push({ code: "fieldNotImportable", path: ["columns", index, "namePart"] });
    mapped.add(entry.fieldId);
  });
  for (const field of inputFields(model, type.id)) {
    if (field.required && !fieldDefault(field) && !mapped.has(field.id))
      issues.push({ code: "requiredFieldUnmapped", path: ["fields", field.id] });
  }
  mapping.relationships.forEach((entry, index) => {
    if (!columns.has(entry.column)) issues.push({ code: "unknownColumn", path: ["relationships", index, "column"] });
    const relation = model.relationships.find((candidate) => candidate.id === entry.relationId);
    const target = relation && model.types.find((candidate) => candidate.id === relation.targetTypeId);
    const primary = target?.primaryFieldId && model.fields.find((field) => field.id === target.primaryFieldId);
    if (
      !relation ||
      relation.archived ||
      relation.sourceTypeId !== type.id ||
      relation.id === type.parentRelationshipId ||
      !target ||
      target.archived ||
      !primary ||
      primary.archived ||
      primary.valueType !== "text" ||
      primary.multiple
    )
      issues.push({ code: "relationshipNotImportable", path: ["relationships", index, "relationId"] });
  });
  return issues;
}

function relatedNamesInCell(cell: SpreadsheetCell, many: boolean): string[] {
  if (cellIsEmpty(cell)) return [];
  const text = cellText(cell);
  return [...new Set(many ? splitListValues(text, RELATED_SEPARATORS) : [text])];
}

export function spreadsheetRelatedNames(
  table: SpreadsheetTable,
  mapping: SpreadsheetMapping,
  model: RecordModel,
): Map<string, string[]> {
  const names = new Map<string, Set<string>>();
  for (const entry of mapping.relationships) {
    const relation = model.relationships.find((candidate) => candidate.id === entry.relationId);
    const index = table.headers.indexOf(entry.column);
    if (!relation || index < 0) continue;
    const bucket = names.get(relation.id) ?? new Set<string>();
    for (const row of table.rows) {
      for (const name of relatedNamesInCell(row.cells[index] ?? null, relation.sourceCardinality === "many"))
        bucket.add(name);
    }
    names.set(relation.id, bucket);
  }
  return new Map([...names.entries()].map(([relationId, bucket]) => [relationId, [...bucket]]));
}

function invalidCode(field: RecordField): SpreadsheetRowErrorCode {
  switch (field.valueType) {
    case "number":
      return "invalidNumber";
    case "currency":
      return "invalidCurrency";
    case "boolean":
      return "invalidBoolean";
    case "date":
      return "invalidDate";
    case "dateTime":
      return "invalidDateTime";
    case "select":
      return "unknownOption";
    case "email":
      return "invalidEmail";
    case "phone":
      return "invalidPhone";
    case "url":
      return "invalidUrl";
    default:
      return "invalidText";
  }
}

function optionId(field: RecordField, text: string): string | null {
  const key = matchOptionKey(text);
  const option =
    field.options.find((candidate) => matchOptionKey(candidate.label) === key) ??
    field.options.find((candidate) => matchOptionKey(candidate.id) === key);
  return option?.id ?? null;
}

function contactValue(field: RecordField, text: string, mapping: SpreadsheetMapping): string | null {
  if (field.valueType === "email") return normalizeEmail(text);
  if (field.valueType === "phone") return normalizePhone(text, mapping.phoneCountryCode);
  if (field.valueType === "url") return normalizeUrl(text);
  return text;
}

function listValue(field: RecordField, cell: SpreadsheetCell, mapping: SpreadsheetMapping): Converted {
  const text = cellText(cell);
  if (field.valueType === "select") {
    const whole = optionId(field, text);
    const ids = whole ? [whole] : splitListValues(text, OPTION_SEPARATORS).map((part) => optionId(field, part));
    if (ids.some((id) => id === null)) return { error: "unknownOption" };
    const unique = [...new Set(ids as string[])];
    if (unique.length > MAX_LIST_VALUES) return { error: "tooManyValues" };
    return { value: { kind: "selectList", value: unique } };
  }
  const parts = splitListValues(text, field.valueType === "text" ? /\n/ : CONTACT_SEPARATORS);
  if (parts.length > MAX_LIST_VALUES) return { error: "tooManyValues" };
  const values = parts.map((part) => contactValue(field, part, mapping));
  if (values.some((value) => value === null)) return { error: invalidCode(field) };
  return { value: { kind: "textList", value: [...new Set(values as string[])] } };
}

function singleValue(
  field: RecordField,
  cell: SpreadsheetCell,
  column: SpreadsheetColumnMapping,
  mapping: SpreadsheetMapping,
): Converted {
  const text = cellText(cell);
  const invalid = { error: invalidCode(field) };
  switch (field.valueType) {
    case "text":
      return { value: { kind: "text", value: text } };
    case "richText":
      return { value: { kind: "richText", documentJson: JSON.stringify(parseMarkdownToJSON(text)) } };
    case "number": {
      const value = parseSpreadsheetNumber(cell, mapping.locale);
      return value === null ? invalid : { value: { kind: "decimal", value, currency: null } };
    }
    case "currency": {
      const parsed = parseSpreadsheetCurrency(cell, mapping.locale);
      const currency = parsed?.currency ?? column.currency ?? field.format?.currency ?? null;
      return parsed && currency ? { value: { kind: "decimal", value: parsed.value, currency } } : invalid;
    }
    case "boolean": {
      const value = parseSpreadsheetBoolean(cell);
      return value === null ? invalid : { value: { kind: "boolean", value } };
    }
    case "date": {
      if (typeof cell !== "string") return invalid;
      const value = parseDateText(
        /^\d{4}-\d{2}-\d{2}T/.test(text) ? text.slice(0, 10) : text,
        mapping.locale,
        column.dateOrder,
      );
      return value === null ? invalid : { value: { kind: "date", value } };
    }
    case "dateTime": {
      if (typeof cell !== "string") return invalid;
      const value = parseDateTimeText(text, mapping.locale, mapping.timeZone, column.dateOrder);
      return value === null ? invalid : { value: { kind: "dateTime", value } };
    }
    case "select": {
      const id = optionId(field, text);
      return id === null ? invalid : { value: { kind: "select", value: id } };
    }
    case "email":
    case "phone":
    case "url": {
      const value = contactValue(field, text, mapping);
      return value === null ? invalid : { value: { kind: "text", value } };
    }
    default:
      return invalid;
  }
}

function convertCell(
  field: RecordField,
  cell: SpreadsheetCell,
  column: SpreadsheetColumnMapping,
  mapping: SpreadsheetMapping,
): Converted {
  const converted =
    field.multiple && field.valueType !== "richText"
      ? listValue(field, cell, mapping)
      : singleValue(field, cell, column, mapping);
  if ("error" in converted || converted.value === null) return converted;
  const parsed = RecordScalarSchema.safeParse(converted.value);
  if (!parsed.success || !scalarMatchesType(parsed.data, field.valueType, field.multiple ?? false))
    return { error: invalidCode(field) };
  return { value: parsed.data };
}

export function spreadsheetChannelParts(cell: SpreadsheetCell): string[] {
  return cellIsEmpty(cell) ? [] : splitListValues(cellText(cell), CONTACT_SEPARATORS);
}

export function spreadsheetChannelIdentity(
  part: string,
  phoneCountryCode?: string,
): Pick<RecordIdentity, "provider" | "value"> | null {
  const email = normalizeEmail(part);
  if (email) return { provider: "mail", value: email };
  const phone = normalizePhone(part, phoneCountryCode);
  return phone ? { provider: "whatsapp", value: phone } : null;
}

function channelIdentities(
  cells: SpreadsheetCell[],
  rowKey: string,
  options: { idempotencyKey: string; phoneCountryCode?: string },
): { identities: RecordIdentity[]; ignored: number } | SpreadsheetRowErrorCode {
  const parts = cells.flatMap(spreadsheetChannelParts);
  if (parts.length > MAX_LIST_VALUES) return "tooManyValues";
  const found = parts.map((part) => spreadsheetChannelIdentity(part, options.phoneCountryCode));
  const unique = new Map(
    found.flatMap((identity) => (identity ? [[`${identity.provider}:${identity.value}`, identity] as const] : [])),
  );
  return {
    ignored: found.filter((identity) => identity === null).length,
    identities: [...unique.values()].map((identity, index) => ({
      id: spreadsheetRecordId(options.idempotencyKey, `identity:${rowKey}:${index}`),
      provider: identity.provider,
      value: identity.value,
      channelClass: channelClass(identity.provider),
      messagingId: null,
      displayName: null,
      profileUrl: null,
      createdAt: SPREADSHEET_DOCUMENT_TIME,
      updatedAt: SPREADSHEET_DOCUMENT_TIME,
    })),
  };
}

export function convertSpreadsheet(
  table: SpreadsheetTable,
  mapping: SpreadsheetMapping,
  model: RecordModel,
  options: { idempotencyKey: string; related: SpreadsheetRelatedRecords },
): SpreadsheetConversion {
  const fields = inputFields(model, mapping.typeId);
  const columnIndex = new Map(table.headers.map((header, index) => [header, index]));
  const columnsByField = new Map(mapping.columns.map((entry) => [entry.fieldId, entry]));
  const lonePartByColumn = loneNameParts(mapping.columns, fields);
  const channelsField = model.fields.find(
    (field) => field.typeId === mapping.typeId && !field.archived && field.valueType === "channels",
  );
  const channelsColumns = channelsField ? mapping.columns.filter((entry) => entry.fieldId === channelsField.id) : [];
  const relations = mapping.relationships.flatMap((entry) => {
    const relation = model.relationships.find((candidate) => candidate.id === entry.relationId);
    const index = columnIndex.get(entry.column);
    return relation && index !== undefined ? [{ entry, relation, index }] : [];
  });
  const errors: SpreadsheetRowError[] = [];
  const documents: RecordExport[] = [];
  let records: RecordDto[] = [];
  let links: RecordExportLink[] = [];
  let convertedRows = 0;
  let ignoredValues = 0;
  const flush = () => {
    if (!records.length) return;
    documents.push({
      format: "customermates-records",
      version: 1,
      typeId: mapping.typeId,
      schemaRevision: model.revision,
      exportedAt: SPREADSHEET_DOCUMENT_TIME,
      records,
      links,
    });
    records = [];
    links = [];
  };
  for (const row of table.rows) {
    const rowErrors: SpreadsheetRowError[] = [];
    const fail = (column: string, code: SpreadsheetRowErrorCode) =>
      rowErrors.push({ rowNumber: row.rowNumber, column, code });
    const values: RecordDto["fields"] = [];
    for (const field of fields) {
      const column = columnsByField.get(field.id);
      const index = column ? columnIndex.get(column.column) : undefined;
      const raw = index === undefined ? null : (row.cells[index] ?? null);
      const cell =
        column?.namePart && !cellIsEmpty(raw)
          ? splitPersonName(cellText(raw), lonePartByColumn.get(column.column))[column.namePart]
          : raw;
      if (!column || cellIsEmpty(cell)) {
        const fallback = fieldDefault(field);
        if (!fallback && field.required && column) fail(column.column, "required");
        values.push({
          fieldId: field.id,
          result: fallback ? { state: "value", value: fallback } : { state: "missing" },
        });
        continue;
      }
      const converted = convertCell(field, cell, column, mapping);
      if ("error" in converted) fail(column.column, converted.error);
      else {
        values.push({
          fieldId: field.id,
          result: converted.value ? { state: "value", value: converted.value } : { state: "missing" },
        });
      }
    }
    const ref = {
      typeId: mapping.typeId,
      recordId: spreadsheetRecordId(options.idempotencyKey, `record:${row.rowNumber}`),
    };
    let identities: RecordIdentity[] | undefined;
    let ignored = 0;
    if (channelsColumns.length) {
      const result = channelIdentities(
        channelsColumns.map((entry) => {
          const index = columnIndex.get(entry.column);
          return index === undefined ? null : (row.cells[index] ?? null);
        }),
        String(row.rowNumber),
        { idempotencyKey: options.idempotencyKey, phoneCountryCode: mapping.phoneCountryCode },
      );
      if (typeof result === "string") fail(channelsColumns[0].column, result);
      else {
        identities = result.identities;
        ignored = result.ignored;
      }
    }
    const rowLinks: RecordExportLink[] = [];
    for (const { entry, relation, index } of relations) {
      const names = relatedNamesInCell(row.cells[index] ?? null, relation.sourceCardinality === "many");
      if (names.length > MAX_LIST_VALUES) {
        fail(entry.column, "tooManyValues");
        continue;
      }
      const targets = new Set<string>();
      for (const name of names) {
        const matches = options.related.get(relation.id)?.get(name) ?? [];
        if (matches.length === 0) fail(entry.column, "relatedNotFound");
        else if (matches.length > 1) fail(entry.column, "relatedAmbiguous");
        else targets.add(matches[0]);
      }
      for (const recordId of targets)
        rowLinks.push({ relationId: relation.id, source: ref, target: { typeId: relation.targetTypeId, recordId } });
    }
    if (rowLinks.length > RECORD_IMPORT_LINK_LIMIT) fail(relations[0]?.entry.column ?? "", "tooManyValues");
    if (rowErrors.length) {
      errors.push(...rowErrors);
      continue;
    }
    if (records.length >= RECORD_IMPORT_LIMIT || links.length + rowLinks.length > RECORD_IMPORT_LINK_LIMIT) flush();
    records.push({
      ref,
      version: 1,
      schemaRevision: model.revision,
      createdAt: SPREADSHEET_DOCUMENT_TIME,
      updatedAt: SPREADSHEET_DOCUMENT_TIME,
      fields: values,
      assignedUserIds: [],
      assignedUsers: [],
      memberUsers: [],
      relationships: [],
      ...(identities ? { identities } : {}),
    });
    links.push(...rowLinks);
    convertedRows += 1;
    ignoredValues += ignored;
  }
  flush();
  return { documents, rowCount: table.rows.length, convertedRows, ignoredValues, errors };
}
