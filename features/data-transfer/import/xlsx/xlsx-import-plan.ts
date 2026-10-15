import type {
  CalculatedValue,
  RecordDto,
  RecordModelView,
  RecordRef,
  RecordScalar,
} from "@/features/records/record-model.schema";
import type {
  ImportRecordsInput,
  ImportRecordsResult,
  RecordExportLink,
} from "@/features/data-transfer/record-transfer.schema";
import type { XlsxTargetOption } from "./xlsx-mapping";
import type { XlsxIssueCode, XlsxMember, XlsxRecordIndex } from "./xlsx-values";
import type { XlsxRow } from "./xlsx-workbook";

import { RECORD_IMPORT_LIMIT, RECORD_IMPORT_LINK_LIMIT } from "@/features/data-transfer/record-transfer.schema";
import { splitPersonName } from "@/features/data-transfer/spreadsheet/spreadsheet-values";

import { normalizeXlsxHeader, xlsxImportFields, XLSX_SKIP_KEY } from "./xlsx-mapping";
import {
  parseXlsxFieldCell,
  parseXlsxMembersCell,
  parseXlsxRangePart,
  parseXlsxRecordId,
  parseXlsxRelationshipCell,
} from "./xlsx-values";
import { xlsxCellText } from "./xlsx-workbook";

export type XlsxImportMode = "create" | "update";

export type XlsxIssue = {
  sheetRow: number;
  column: string | null;
  columnIndex?: number;
  code: XlsxIssueCode;
  value?: string;
};

export type XlsxLookups = {
  members: XlsxMember[] | null;
  relations: Map<string, XlsxRecordIndex | null>;
};

type XlsxExisting = { records: RecordDto[] };

type XlsxPlannedRow = {
  sheetRow: number;
  record: RecordDto | null;
  links: RecordExportLink[];
  issues: XlsxIssue[];
  skipped: XlsxIssueCode | null;
};

export type XlsxPlanInput = {
  model: RecordModelView;
  typeId: string;
  headers: string[];
  rows: XlsxRow[];
  mapping: string[];
  options: XlsxTargetOption[];
  lookups: XlsxLookups;
};

type XlsxRowFailure = { sheetRow: number; reasons: string[] };

export type XlsxImportSummary = { created: number; updated: number; skipped: number; failed: XlsxRowFailure[] };

export type XlsxImportPort = (
  input: ImportRecordsInput,
) => Promise<{ ok: true; data: ImportRecordsResult } | { ok: false; message: string; fatal: boolean }>;

type ParsedRow = {
  sheetRow: number;
  values: Map<string, RecordScalar | null>;
  links: Array<{ relationId: string; targets: RecordRef[] }>;
  assignedUserIds: string[] | null;
  recordId: string | null;
  issues: XlsxIssue[];
};

const MISSING: CalculatedValue = { state: "missing" };

function valueResult(value: RecordScalar | null): CalculatedValue {
  return value ? { state: "value", value } : MISSING;
}

export function parseXlsxRows(input: XlsxPlanInput, rows: XlsxRow[] = input.rows): ParsedRow[] {
  const options = new Map(input.options.map((option) => [option.key, option]));
  const fields = new Map(input.model.fields.map((field) => [field.id, field]));
  return rows.map((row) => {
    const parsed: ParsedRow = {
      sheetRow: row.sheetRow,
      values: new Map(),
      links: [],
      assignedUserIds: null,
      recordId: null,
      issues: [],
    };
    const ranges = new Map<string, { start: string | null; end: string | null }>();
    input.mapping.forEach((key, column) => {
      if (key === XLSX_SKIP_KEY) return;
      const target = options.get(key)?.target;
      if (!target) return;
      const cell = row.cells[column] ?? null;
      const header = input.headers[column] ?? null;
      const report = (code: XlsxIssueCode, value?: string) =>
        parsed.issues.push({
          sheetRow: row.sheetRow,
          column: header,
          columnIndex: column,
          code,
          ...(value === undefined ? {} : { value }),
        });
      if (target.kind === "field") {
        const field = fields.get(target.fieldId);
        if (!field) return;
        const result = parseXlsxFieldCell(cell, field, input.lookups.members);
        if (result.ok) parsed.values.set(field.id, result.value);
        else report(result.code, result.value);
      } else if (target.kind === "rangePart") {
        const field = fields.get(target.fieldId);
        if (!field) return;
        const result = parseXlsxRangePart(cell, field);
        if (!result.ok) {
          report(result.code, result.value);
          return;
        }
        const current = ranges.get(field.id) ?? { start: null, end: null };
        ranges.set(field.id, { ...current, [target.part]: result.value });
      } else if (target.kind === "nameParts") {
        const name = splitPersonName(xlsxCellText(cell));
        for (const [fieldId, part] of [
          [target.firstFieldId, name.first],
          [target.lastFieldId, name.last],
        ] as const) {
          const field = fields.get(fieldId);
          if (!field) continue;
          const result = parseXlsxFieldCell(part || null, field, input.lookups.members);
          if (result.ok) parsed.values.set(field.id, result.value);
          else report(result.code, result.value);
        }
      } else if (target.kind === "relationship") {
        const result = parseXlsxRelationshipCell(cell, input.lookups.relations.get(target.relationId) ?? null);
        if (result.ok) {
          if (result.value.length) parsed.links.push({ relationId: target.relationId, targets: result.value });
        } else report(result.code, result.value);
      } else if (target.kind === "assignedTo") {
        const result = parseXlsxMembersCell(cell, input.lookups.members);
        if (result.ok) parsed.assignedUserIds = result.value.length ? result.value : null;
        else report(result.code, result.value);
      } else if (target.kind === "recordId") {
        const result = parseXlsxRecordId(cell);
        if (result.ok) parsed.recordId = result.value;
        else report(result.code, result.value);
      }
    });
    for (const [fieldId, range] of ranges) {
      if (!parsed.values.has(fieldId))
        parsed.values.set(fieldId, range.start || range.end ? { kind: "range", ...range } : null);
    }
    return parsed;
  });
}

function xlsxMatchKey(value: RecordScalar | null | undefined): string | null {
  if (!value) return null;
  switch (value.kind) {
    case "text":
    case "select":
    case "member":
    case "date":
    case "dateTime":
      return normalizeXlsxHeader(value.value) || value.value.trim() || null;
    case "decimal":
      return value.value;
    case "boolean":
      return String(value.value);
    default:
      return null;
  }
}

function scalarOf(result: CalculatedValue | undefined): RecordScalar | null {
  return result?.state === "value" ? result.value : null;
}

function linksOf(row: ParsedRow, ref: RecordRef): RecordExportLink[] {
  return row.links.flatMap(({ relationId, targets }) => targets.map((target) => ({ relationId, source: ref, target })));
}

export function planXlsxImport(
  input: XlsxPlanInput,
  mode: XlsxImportMode,
  matchKey: string | null,
  existing: XlsxExisting | null,
  newId: () => string,
  now: string,
): XlsxPlannedRow[] {
  const parsed = parseXlsxRows(input);
  const fields = xlsxImportFields(input.model, input.typeId);
  const matchFieldId = matchKey?.startsWith("field:") ? matchKey.slice("field:".length) : null;
  const matchHeader =
    matchKey && input.mapping.includes(matchKey) ? input.headers[input.mapping.indexOf(matchKey)] : null;
  const byId = new Map((existing?.records ?? []).map((record) => [record.ref.recordId, record]));
  const byKey = new Map<string, RecordDto[]>();
  if (matchFieldId) {
    for (const record of existing?.records ?? []) {
      const key = xlsxMatchKey(scalarOf(record.fields.find((field) => field.fieldId === matchFieldId)?.result));
      if (key) byKey.set(key, [...(byKey.get(key) ?? []), record]);
    }
  }
  const claimed = new Set<string>();
  return parsed.map((row) => {
    const failed = (issues: XlsxIssue[]): XlsxPlannedRow => ({
      sheetRow: row.sheetRow,
      record: null,
      links: [],
      issues,
      skipped: null,
    });
    const rowIssue = (code: XlsxIssueCode, column: string | null): XlsxIssue => ({
      sheetRow: row.sheetRow,
      column,
      code,
    });
    if (row.issues.length) return failed(row.issues);
    if (mode === "create") {
      const valueOf = (field: (typeof fields)[number]) =>
        row.values.get(field.id) ?? (field.behavior.kind === "input" ? (field.behavior.defaultValue ?? null) : null);
      const missing = fields.filter((field) => field.required && !valueOf(field));
      if (missing.length) {
        const columnOf = (fieldId: string) => {
          const index = input.mapping.indexOf(`field:${fieldId}`);
          return index >= 0 ? input.headers[index] : null;
        };
        return failed(missing.map((field) => ({ ...rowIssue("required", columnOf(field.id)), value: field.label })));
      }
      const ref = { typeId: input.typeId, recordId: newId() };
      const record: RecordDto = {
        ref,
        version: 1,
        schemaRevision: input.model.revision,
        createdAt: now,
        updatedAt: now,
        fields: fields
          .filter((field) => field.behavior.kind === "input" || row.values.has(field.id))
          .map((field) => ({ fieldId: field.id, result: valueResult(valueOf(field)) })),
        assignedUserIds: row.assignedUserIds ?? [],
        assignedUsers: [],
        memberUsers: [],
        relationships: [],
      };
      return { sheetRow: row.sheetRow, record, links: linksOf(row, ref), issues: [], skipped: null };
    }
    let match: RecordDto | undefined;
    if (matchKey === "recordId") {
      if (!row.recordId) return failed([rowIssue("missingMatchValue", matchHeader)]);
      match = byId.get(row.recordId);
    } else if (matchFieldId) {
      const key = xlsxMatchKey(row.values.get(matchFieldId));
      if (!key) return failed([rowIssue("missingMatchValue", matchHeader)]);
      const candidates = byKey.get(key) ?? [];
      if (candidates.length > 1) return failed([rowIssue("ambiguousMatch", matchHeader)]);
      match = candidates[0];
    }
    if (!match) return { sheetRow: row.sheetRow, record: null, links: [], issues: [], skipped: "noMatch" };
    if (claimed.has(match.ref.recordId)) return failed([rowIssue("duplicateMatch", matchHeader)]);
    claimed.add(match.ref.recordId);
    if (match.fields.some((field) => field.result.state === "restricted"))
      return failed([rowIssue("restricted", null)]);
    const record: RecordDto = {
      ...match,
      fields: match.fields.map((field) => {
        const value = row.values.get(field.fieldId);
        return value ? { fieldId: field.fieldId, result: valueResult(value) } : field;
      }),
      assignedUserIds: row.assignedUserIds ?? match.assignedUserIds,
    };
    return { sheetRow: row.sheetRow, record, links: linksOf(row, match.ref), issues: [], skipped: null };
  });
}

export function xlsxImportBatches(rows: XlsxPlannedRow[]): XlsxPlannedRow[][] {
  const batches: XlsxPlannedRow[][] = [];
  let current: XlsxPlannedRow[] = [];
  let links = 0;
  for (const row of rows) {
    if (!row.record) continue;
    if (current.length >= RECORD_IMPORT_LIMIT || links + row.links.length > RECORD_IMPORT_LINK_LIMIT) {
      batches.push(current);
      current = [];
      links = 0;
    }
    current.push(row);
    links += row.links.length;
  }
  if (current.length) batches.push(current);
  return batches;
}

function documentOf(
  rows: XlsxPlannedRow[],
  typeId: string,
  schemaRevision: number,
  now: string,
): ImportRecordsInput["document"] {
  return {
    format: "customermates-records",
    version: 1,
    typeId,
    schemaRevision,
    exportedAt: now,
    records: rows.flatMap((row) => (row.record ? [row.record] : [])),
    links: rows.flatMap((row) => row.links),
  };
}

export async function runXlsxImport(options: {
  rows: XlsxPlannedRow[];
  mode: XlsxImportMode;
  typeId: string;
  schemaRevision: number;
  sessionKey: string;
  now: string;
  importRecords: XlsxImportPort;
  describeIssue: (issue: XlsxIssue) => string;
  onProgress?: (processed: number, total: number) => void;
}): Promise<XlsxImportSummary> {
  const summary: XlsxImportSummary = { created: 0, updated: 0, skipped: 0, failed: [] };
  for (const row of options.rows) {
    if (row.skipped) summary.skipped += 1;
    else if (!row.record)
      summary.failed.push({ sheetRow: row.sheetRow, reasons: row.issues.map(options.describeIssue) });
  }
  const batches = xlsxImportBatches(options.rows);
  const total = batches.reduce((sum, batch) => sum + batch.length, 0);
  let processed = 0;
  let fatal: string | null = null;
  let systemic = false;
  const apply = async (rows: XlsxPlannedRow[], key: string) => {
    const result = await options.importRecords({
      document: documentOf(rows, options.typeId, options.schemaRevision, options.now),
      mode: options.mode,
      idempotencyKey: key,
    });
    if (result.ok) {
      summary.created += result.data.created;
      summary.updated += result.data.updated;
      summary.skipped += options.mode === "update" ? rows.length - result.data.updated : 0;
    }
    return result;
  };
  for (const [index, batch] of batches.entries()) {
    if (fatal) {
      for (const row of batch) summary.failed.push({ sheetRow: row.sheetRow, reasons: [fatal] });
      processed += batch.length;
      options.onProgress?.(processed, total);
      continue;
    }
    const result = await apply(batch, `${options.sessionKey}:${index}`);
    if (result.ok) systemic = false;
    else {
      if (result.fatal || systemic || batch.length === 1) {
        if (result.fatal) fatal = result.message;
        for (const row of batch) summary.failed.push({ sheetRow: row.sheetRow, reasons: [result.message] });
      } else {
        const messages = new Set<string>();
        let succeeded = false;
        for (const [position, row] of batch.entries()) {
          if (fatal) {
            summary.failed.push({ sheetRow: row.sheetRow, reasons: [fatal] });
            continue;
          }
          const single = await apply([row], `${options.sessionKey}:${index}:${position}`);
          if (single.ok) {
            succeeded = true;
            continue;
          }
          if (single.fatal) fatal = single.message;
          messages.add(single.message);
          summary.failed.push({ sheetRow: row.sheetRow, reasons: [single.message] });
        }
        if (!succeeded && messages.size === 1) systemic = true;
      }
    }
    processed += batch.length;
    options.onProgress?.(processed, total);
  }
  summary.failed.sort((left, right) => left.sheetRow - right.sheetRow);
  return summary;
}
