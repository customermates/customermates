import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { ImportEntityDescriptor } from "./import-entity.registry";
import type { MappingTarget, SourceColumn } from "./import-mapping";
import type { WorkbookCellValue } from "../workbook-cell";

import { CustomColumnType, MessagingProvider } from "@/generated/prisma";

import { RANGE_SEPARATOR, STORED_MULTI_VALUE_SEPARATOR } from "../workbook-columns";
import { columnLetter, normalizeHeader } from "./import-mapping";
import { looksLikePhoneText, normalizeChannelValue } from "@/features/contacts/channel-value";
import { isPhoneProvider } from "@/ee/messaging/provider";

export type SourceRow = {
  sourceIndex: number;
  sheetRow: number;
  cells: WorkbookCellValue[];
};

export type PlanRow = {
  sourceIndex: number;
  sheetRow: number;
  recordId: string | null;
  payload: Record<string, unknown>;
};

export const IMPORT_ISSUE_CODES = [
  "channelsNotUpdated",
  "duplicateRecordId",
  "invalidChannelValue",
  "notANumber",
  "notAPhoneNumber",
  "relationAmbiguous",
  "relationNotFound",
  "unknownOption",
  "unknownProvider",
] as const;

export type IssueValues = Record<string, string | number>;

export type PlanIssue = {
  sheetRow: number;
  sourceIndex: number;
  columnLetter: string | null;
  columnLabel: string | null;
  values: IssueValues;
  code: string;
  blocking: boolean;
};

export type ImportPlan = {
  create: PlanRow[];
  update: PlanRow[];
  issues: PlanIssue[];
};

export type RelationIndex = Record<string, Map<string, string[]>>;

export type IdentifierRow = { provider: string; value: string; displayName?: string };

const FIRST_DATA_ROW = 2;

function mergeIdentifiers(mapped: IdentifierRow[], fromSheet: IdentifierRow[]): IdentifierRow[] {
  const merged: IdentifierRow[] = [];
  const seen = new Set<string>();

  for (const entry of [...mapped, ...fromSheet]) {
    const key = `${entry.provider}:${entry.value.toLocaleLowerCase()}`;
    if (seen.has(key)) continue;

    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

const MESSAGING_PROVIDERS = new Set<string>(Object.values(MessagingProvider));

export function identifiersBySheetRow(rows: Array<Record<string, string>>): Map<number, IdentifierRow[]> {
  const byRow = new Map<number, IdentifierRow[]>();

  for (const row of rows) {
    const sheetRow = Number(row.row);
    const value = (row.value ?? "").trim();
    if (!Number.isInteger(sheetRow) || sheetRow < FIRST_DATA_ROW || value.length === 0) continue;

    const entry: IdentifierRow = { provider: (row.provider ?? "").trim(), value };
    const displayName = (row.displayName ?? "").trim();
    if (displayName.length > 0) entry.displayName = displayName;

    byRow.set(sheetRow, [...(byRow.get(sheetRow) ?? []), entry]);
  }

  return byRow;
}

export type DealServiceRow = { serviceId: string; quantity: number };

export function dealServicesBySheetRow(rows: Array<Record<string, string>>): Map<number, DealServiceRow[]> {
  const byRow = new Map<number, DealServiceRow[]>();

  for (const row of rows) {
    const sheetRow = Number(row.row);
    const serviceId = (row.serviceId ?? "").trim();
    if (!Number.isInteger(sheetRow) || sheetRow < FIRST_DATA_ROW || serviceId.length === 0) continue;

    const parsed = Number((row.quantity ?? "").trim());
    const quantity = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;

    byRow.set(sheetRow, [...(byRow.get(sheetRow) ?? []), { serviceId, quantity }]);
  }

  return byRow;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asText(value: WorkbookCellValue): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();

  return String(value).trim();
}

export function channelValueProblem(provider: string, raw: string): { code: string; values: IssueValues } | null {
  const messagingProvider = provider as MessagingProvider;

  if (isPhoneProvider(messagingProvider) && !looksLikePhoneText(raw))
    return { code: "notAPhoneNumber", values: { value: raw } };

  if (normalizeChannelValue(messagingProvider, raw) === null)
    return { code: "invalidChannelValue", values: { value: raw, provider } };

  return null;
}

function splitMulti(value: string): string[] {
  return value
    .split(STORED_MULTI_VALUE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

const RANGE_COLUMN_TYPES = new Set<CustomColumnType>([CustomColumnType.dateRange, CustomColumnType.dateTimeRange]);

function resolveOptionValue(column: CustomColumnDto, raw: string): string | null {
  if (RANGE_COLUMN_TYPES.has(column.type)) {
    return raw.includes(RANGE_SEPARATOR)
      ? raw
          .split(RANGE_SEPARATOR)
          .map((part) => part.trim())
          .join(STORED_MULTI_VALUE_SEPARATOR)
      : raw;
  }

  if (column.type !== CustomColumnType.singleSelect) return raw;

  const byLabel = column.options.options.filter((option) => option.label === raw);
  if (byLabel.length === 1) return byLabel[0].value;

  const byValue = column.options.options.find((option) => option.value === raw);
  return byValue ? byValue.value : null;
}

export function buildPlan(args: {
  rows: SourceRow[];
  sources: SourceColumn[];
  mapping: MappingTarget[];
  descriptor: ImportEntityDescriptor;
  customColumns: CustomColumnDto[];
  relationIndex: RelationIndex;
  identifiersByRow?: Map<number, IdentifierRow[]>;
  dealServicesByRow?: Map<number, DealServiceRow[]>;
}): ImportPlan {
  const { rows, sources, mapping, descriptor, customColumns, relationIndex, identifiersByRow } = args;
  const customById = new Map(customColumns.map((column) => [column.id, column]));
  const fieldByKey = new Map(descriptor.fields.map((field) => [field.key, field]));

  const create: PlanRow[] = [];
  const update: PlanRow[] = [];
  const issues: PlanIssue[] = [];
  const seenRecordIds = new Map<string, number>();

  for (const row of rows) {
    const payload: Record<string, unknown> = {};
    const customFieldValues: Array<{ columnId: string; value: string }> = [];
    const blankRequiredText: string[] = [];
    let recordId: string | null = null;
    let rowFailed = false;

    const note = (index: number | null, code: string, values: IssueValues, blocking: boolean) => {
      if (blocking) rowFailed = true;
      issues.push({
        sheetRow: row.sheetRow,
        sourceIndex: row.sourceIndex,
        columnLetter: index === null ? null : columnLetter(index),
        columnLabel: index === null ? null : (sources[index]?.header ?? null),
        code,
        values,
        blocking,
      });
    };

    const fail = (index: number | null, code: string, values: IssueValues) => note(index, code, values, true);
    const warn = (index: number | null, code: string, values: IssueValues) => note(index, code, values, false);

    mapping.forEach((target, index) => {
      const text = asText(row.cells[index] ?? null);
      if (target.kind === "ignore") return;

      if (target.kind === "recordId") {
        if (text.length > 0) recordId = text;
        return;
      }

      if (target.kind === "customField") {
        if (text.length === 0) return;

        const column = customById.get(target.columnId);
        if (!column) return;

        const resolved = resolveOptionValue(column, text);
        if (resolved === null) {
          fail(index, "unknownOption", { value: text, column: column.label });
          return;
        }

        customFieldValues.push({ columnId: column.id, value: resolved });
        return;
      }

      if (target.kind === "identifier") {
        if (text.length === 0) return;

        const existing = (payload.identifiers as Array<{ provider: string; value: string }>) ?? [];
        const accepted: Array<{ provider: string; value: string }> = [];

        for (const value of splitMulti(text)) {
          const problem = channelValueProblem(target.provider, value);

          if (problem) warn(index, problem.code, problem.values);
          else accepted.push({ provider: target.provider, value });
        }

        const combined = [...existing, ...accepted];
        if (combined.length > 0) payload.identifiers = combined;
        return;
      }

      const field = fieldByKey.get(target.key);
      if (!field) return;

      if (text.length === 0) {
        if (field.kind === "text" && field.requiredOnCreate) blankRequiredText.push(field.key);
        return;
      }

      if (field.kind === "number") {
        const numeric = Number(text.replace(",", "."));
        if (isNaN(numeric)) fail(index, "notANumber", { value: text });
        else payload[field.key] = numeric;
        return;
      }

      if (field.kind === "relationIds" || field.kind === "dealServices") {
        const target_ = field.relationTarget ?? "service";
        const index_ = relationIndex[target_] ?? new Map<string, string[]>();
        const ids: string[] = [];

        for (const token of splitMulti(text)) {
          if (UUID_PATTERN.test(token)) {
            ids.push(token);
            continue;
          }

          const byName = index_.get(token.toLocaleLowerCase()) ?? index_.get(normalizeHeader(token));

          if (!byName || byName.length === 0) fail(index, "relationNotFound", { value: token });
          else if (byName.length > 1) fail(index, "relationAmbiguous", { value: token });
          else ids.push(byName[0]);
        }

        if (field.kind === "dealServices") {
          const fromSheet = args.dealServicesByRow?.get(row.sheetRow) ?? [];
          const quantityById = new Map(fromSheet.map((entry) => [entry.serviceId, entry.quantity]));

          payload[field.key] = ids.map((serviceId) => ({ serviceId, quantity: quantityById.get(serviceId) ?? 1 }));
        } else payload[field.key] = ids;
        return;
      }

      payload[field.key] = text;
    });

    if (!recordId) for (const key of blankRequiredText) payload[key] ??= "";

    if (customFieldValues.length > 0) payload.customFieldValues = customFieldValues;

    if (recordId) {
      const previous = seenRecordIds.get(recordId);
      if (previous !== undefined) fail(null, "duplicateRecordId", { row: previous });
      else seenRecordIds.set(recordId, row.sheetRow);
    }

    if (recordId && payload.identifiers) {
      delete payload.identifiers;
      warn(null, "channelsNotUpdated", {});
    }

    const sheetIdentifiers =
      descriptor.supportsIdentifiers && !recordId ? identifiersByRow?.get(row.sheetRow) : undefined;

    if (sheetIdentifiers && sheetIdentifiers.length > 0) {
      const unknown = sheetIdentifiers.filter((entry) => !MESSAGING_PROVIDERS.has(entry.provider));

      for (const entry of unknown) fail(null, "unknownProvider", { value: entry.provider });

      if (unknown.length === 0) {
        const usable: IdentifierRow[] = [];

        for (const entry of sheetIdentifiers) {
          const problem = channelValueProblem(entry.provider, entry.value);

          if (problem) warn(null, problem.code, problem.values);
          else usable.push(entry);
        }

        const merged = mergeIdentifiers((payload.identifiers as IdentifierRow[]) ?? [], usable);
        if (merged.length > 0) payload.identifiers = merged;
      }
    }

    if (rowFailed) continue;

    const planRow: PlanRow = { sourceIndex: row.sourceIndex, sheetRow: row.sheetRow, recordId, payload };

    if (recordId) update.push({ ...planRow, payload: { ...payload, id: recordId } });
    else create.push(planRow);
  }

  return { create, update, issues };
}

export function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let start = 0; start < rows.length; start += size) chunks.push(rows.slice(start, start + size));

  return chunks;
}
