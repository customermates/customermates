import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { ImportEntityDescriptor } from "./import-entity.registry";
import type { MappingTarget, SourceColumn } from "./import-mapping";
import type { WorkbookCellValue } from "../workbook-cell";

import { CustomColumnType, MessagingProvider } from "@/generated/prisma";

import { STORED_MULTI_VALUE_SEPARATOR } from "../workbook-columns";
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

export type PlanIssue = {
  sheetRow: number;
  sourceIndex: number;
  columnLetter: string | null;
  columnLabel: string | null;
  message: string;
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

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asText(value: WorkbookCellValue): string {
  if (value === null) return "";
  if (value instanceof Date) return value.toISOString();

  return String(value).trim();
}

export function channelValueProblem(provider: string, raw: string): string | null {
  const messagingProvider = provider as MessagingProvider;

  if (isPhoneProvider(messagingProvider) && !looksLikePhoneText(raw)) return `"${raw}" is not a phone number`;

  return normalizeChannelValue(messagingProvider, raw) === null ? `"${raw}" is not a valid ${provider} value` : null;
}

function splitMulti(value: string): string[] {
  return value
    .split(STORED_MULTI_VALUE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function resolveOptionValue(column: CustomColumnDto, raw: string): string | null {
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
    let recordId: string | null = null;
    let rowFailed = false;

    const note = (index: number | null, code: string, message: string, blocking: boolean) => {
      if (blocking) rowFailed = true;
      issues.push({
        sheetRow: row.sheetRow,
        sourceIndex: row.sourceIndex,
        columnLetter: index === null ? null : columnLetter(index),
        columnLabel: index === null ? null : (sources[index]?.header ?? null),
        code,
        message,
        blocking,
      });
    };

    const fail = (index: number | null, code: string, message: string) => note(index, code, message, true);
    const warn = (index: number | null, code: string, message: string) => note(index, code, message, false);

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
          fail(index, "unknownOption", `"${text}" is not an option of ${column.label}`);
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

          if (problem) warn(index, "invalidChannelValue", problem);
          else accepted.push({ provider: target.provider, value });
        }

        const combined = [...existing, ...accepted];
        if (combined.length > 0) payload.identifiers = combined;
        return;
      }

      if (text.length === 0) return;

      const field = fieldByKey.get(target.key);
      if (!field) return;

      if (field.kind === "number") {
        const numeric = Number(text.replace(",", "."));
        if (isNaN(numeric)) fail(index, "notANumber", `"${text}" is not a number`);
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

          if (!byName || byName.length === 0) fail(index, "relationNotFound", `"${token}" was not found`);
          else if (byName.length > 1) fail(index, "relationAmbiguous", `"${token}" matches more than one record`);
          else ids.push(byName[0]);
        }

        if (field.kind === "dealServices") payload[field.key] = ids.map((serviceId) => ({ serviceId, quantity: 1 }));
        else payload[field.key] = ids;
        return;
      }

      payload[field.key] = text;
    });

    if (customFieldValues.length > 0) payload.customFieldValues = customFieldValues;

    if (recordId) {
      const previous = seenRecordIds.get(recordId);
      if (previous !== undefined) fail(null, "duplicateRecordId", `Row ${previous} already updates this record`);
      else seenRecordIds.set(recordId, row.sheetRow);
    }

    if (recordId && payload.identifiers) {
      delete payload.identifiers;
      warn(null, "channelsNotUpdated", "Channels are left unchanged on an existing record");
    }

    const sheetIdentifiers =
      descriptor.supportsIdentifiers && !recordId ? identifiersByRow?.get(row.sheetRow) : undefined;

    if (sheetIdentifiers && sheetIdentifiers.length > 0) {
      const unknown = sheetIdentifiers.filter((entry) => !MESSAGING_PROVIDERS.has(entry.provider));

      for (const entry of unknown) fail(null, "unknownProvider", `"${entry.provider}" is not a known channel type`);

      if (unknown.length === 0) {
        const usable: IdentifierRow[] = [];

        for (const entry of sheetIdentifiers) {
          const problem = channelValueProblem(entry.provider, entry.value);

          if (problem) warn(null, "invalidChannelValue", problem);
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
