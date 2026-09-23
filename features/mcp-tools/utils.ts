import { z } from "zod";
import { encode } from "@toon-format/toon";
import { getTranslations } from "next-intl/server";

import type { CustomErrorCode } from "@/core/validation/validation.types";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { createZodError, type InteractorResult } from "@/core/validation/validation.utils";

import {
  mcpInteractorFailure,
  mcpValidationFailure,
  validationError,
  VALIDATION_ERROR_PREFIX,
  type McpToolFailureResult,
  type McpToolResult,
} from "./mcp-tool";

export { mcpInteractorFailure, mcpValidationFailure, VALIDATION_ERROR_PREFIX } from "./mcp-tool";

export function encodeToToon(data: unknown): string {
  try {
    return encode(data);
  } catch (error) {
    return String(error);
  }
}

export type McpPageSize = 5 | 10 | 25 | 100;

export const MCP_PAGE_SIZES: readonly McpPageSize[] = [5, 10, 25, 100];

export const MCP_DEFAULT_PAGE_SIZE: McpPageSize = 25;

export function roundMcpPageSize(value: number): McpPageSize {
  return [...MCP_PAGE_SIZES].reverse().find((size) => size <= value) ?? MCP_PAGE_SIZES[0];
}

export const MCP_PAGE_SIZE_DESCRIPTION =
  "Results per page: 5, 10, 25 or 100. A number in between is not refused, it is lowered to the next of those sizes and the call still succeeds, so never report an adjusted page size as a rejection; the size actually used comes back as pageSize. When a result was truncated, ask for the next size down.";

export const mcpPageSize = (
  defaultValue: McpPageSize,
  describe = `${MCP_PAGE_SIZE_DESCRIPTION} Default ${defaultValue}.`,
) => z.coerce.number().int().min(1).max(100).default(defaultValue).transform(roundMcpPageSize).describe(describe);

export const mcpOptionalPageSize = (describe: string) =>
  z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .transform((value) => (value === undefined ? undefined : roundMcpPageSize(value)))
    .describe(describe);

export const mcpPage = (maximum?: number) => {
  const page = z.coerce.number().int().min(1);
  const bounded = maximum === undefined ? page : page.max(maximum);

  return bounded.default(1).describe("1-indexed page number");
};

async function customErrorText(code: CustomErrorCode, values?: Record<string, string>): Promise<string> {
  const t = await getTranslations("Common.errors");
  let message = t.raw(code) as string;
  if (values) for (const [key, value] of Object.entries(values)) message = message.replaceAll(`{${key}}`, value);
  return `${VALIDATION_ERROR_PREFIX} ${message}`;
}

export function nestedValidationErrorText(error: z.ZodError): string {
  return validationError(error);
}

export function nestedCustomErrorText(code: CustomErrorCode, values?: Record<string, string>): Promise<string> {
  return customErrorText(code, values);
}

export async function customMcpFailure(
  code: CustomErrorCode,
  values?: Record<string, string>,
  path: Array<string | number> = [],
): Promise<McpToolFailureResult> {
  const text = await customErrorText(code, values);
  const message = text.slice(VALIDATION_ERROR_PREFIX.length).trim();
  const failure = mcpInteractorFailure(createZodError(message, path, { ...values, error: code }));
  return { ...failure, text };
}

export function mcpMessageFailure(message: string, path: Array<string | number> = []): McpToolFailureResult {
  const failure = mcpValidationFailure(createZodError(message, path));
  return { ...failure, text: `${VALIDATION_ERROR_PREFIX} ${message}` };
}

function formatDatesRecursively(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Date) return isNaN(value.getTime()) ? String(value) : value.toISOString();

  if (Array.isArray(value)) return value.map(formatDatesRecursively);

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) result[key] = formatDatesRecursively(val);

    return result;
  }

  return value;
}

export type SerializedDates<T> = T extends Date
  ? string
  : T extends readonly unknown[]
    ? { [Index in keyof T]: SerializedDates<T[Index]> }
    : T extends object
      ? { [Key in keyof T]: SerializedDates<T[Key]> }
      : T;

export function formatDatesInResponse<T>(data: T): SerializedDates<T> {
  return formatDatesRecursively(data) as SerializedDates<T>;
}

export const FILTER_OPERATOR_GROUPS = {
  singleValue: [
    FilterOperatorKey.equals,
    FilterOperatorKey.contains,
    FilterOperatorKey.startsWith,
    FilterOperatorKey.gt,
    FilterOperatorKey.gte,
    FilterOperatorKey.lt,
    FilterOperatorKey.lte,
  ],
  multiValue: [FilterOperatorKey.in, FilterOperatorKey.notIn, FilterOperatorKey.between],
  relativeWindow: [FilterOperatorKey.inLastDays],
  noValue: [
    FilterOperatorKey.isNull,
    FilterOperatorKey.isNotNull,
    FilterOperatorKey.hasUnset,
    FilterOperatorKey.allSet,
    FilterOperatorKey.hasNone,
    FilterOperatorKey.hasSome,
  ],
} as const satisfies Record<string, readonly FilterOperatorKey[]>;

export const FILTER_OPERATORS: readonly FilterOperatorKey[] = Object.values(FILTER_OPERATOR_GROUPS).flat();

export const FILTER_SYNTAX = {
  rule: "{ field, operator, value? }, rules are AND-combined",
  operators: {
    singleValue: FILTER_OPERATOR_GROUPS.singleValue,
    multiValue: FILTER_OPERATOR_GROUPS.multiValue,
    relativeWindow: FILTER_OPERATOR_GROUPS.relativeWindow,
    noValue: FILTER_OPERATOR_GROUPS.noValue,
  },
  values: {
    singleValue: "one string",
    multiValue: "string array; between needs exactly two values",
    relativeWindow: "positive integer number of days",
    noValue: "omit value",
  },
  examples: [
    { field: "<single-select-custom-column-uuid>", operator: "in", value: ["<option-uuid>"] },
    { field: "createdAt", operator: "inLastDays", value: 30 },
    { field: "email", operator: "isNotNull" },
  ],
};

export const SORT_SYNTAX = {
  shape: { field: "string", direction: "asc | desc" },
  fieldKinds: {
    builtin: "Built-in field name (e.g. name, totalValue, createdAt). See sortableFields entries without columnType.",
    customColumn: "Custom column UUID. See sortableFields entries with columnType.",
  },
  comparison: {
    currency: "numeric",
    date: "chronological",
    dateTime: "chronological",
    dateRange: "chronological by start date, then by end date",
    dateTimeRange: "chronological by start datetime, then by end datetime",
    plain: "locale-aware string",
    email: "locale-aware string",
    phone: "locale-aware string",
    link: "locale-aware string",
    singleSelect: "by stored option uuid (ordering between options is not user-meaningful)",
  },
  nullHandling: "rows missing the value sort last regardless of direction",
  examples: [
    { field: "name", direction: "asc" },
    { field: "createdAt", direction: "desc" },
    { field: "<custom-column-uuid>", direction: "asc" },
  ],
};

export const FILTER_FIELD_DESCRIPTION =
  "Array of filter rules, AND-combined. Each rule is { field, operator, value? }. " +
  `Operators with one string value: ${FILTER_OPERATOR_GROUPS.singleValue.join(", ")}; with a string array: ${FILTER_OPERATOR_GROUPS.multiValue.join(", ")} (between needs exactly two); with a positive integer of days: ${FILTER_OPERATOR_GROUPS.relativeWindow.join(", ")}; without a value: ${FILTER_OPERATOR_GROUPS.noValue.join(", ")}. ` +
  'Example: [{"field":"name","operator":"contains","value":"acme"},{"field":"createdAt","operator":"inLastDays","value":30}]. ' +
  "isNull and isNotNull are offered on custom columns and mean the column was never filled in, which is how you find records missing a value. " +
  "On a field of linked-record ids, in and notIn take those ids and mean linked to any of them or to none of them, while hasSome and hasNone take no value and mean has any link at all or none at all: " +
  'to find deals with no open task, list the open tasks, then filter [{"field":"taskIds","operator":"notIn","value":["<task-id>"]}]. ' +
  "Call get_record_schema to see all filterable fields and which operators each one takes.";

export const filtersDescription = (filterableFields: string) =>
  "Array of filter rules, AND-combined. Each rule is { field, operator, value? }. " +
  "Use only the operators listed in each field's hint; value-less operators take no value. " +
  'Example: [{"field":"createdAt","operator":"inLastDays","value":30}]. ' +
  `Filterable fields: ${filterableFields}.`;

export const sortDescription = (sortableFields: string) =>
  `Sort by one field: { field, direction: "asc" | "desc" }. Sortable fields: ${sortableFields}.`;

export function enumHint(values: readonly string[]): string {
  return `(one of: ${values.join(", ")})`;
}

export function forbidNullFields<T extends z.ZodObject<z.ZodRawShape>>(schema: T, fields: readonly string[]) {
  return schema.superRefine((value, ctx) => {
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    for (const field of fields) {
      if (record[field] === null) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message:
            `Refusing to set '${field}' to null because that would wipe the relationship. ` +
            `Omit the field to keep existing links, pass [] to explicitly clear, ` +
            `or use manage_record_links to remove specific ids.`,
        });
      }
    }
  });
}

export const NO_NULL_WIPE_WARNING =
  "NEVER pass null on relationship arrays; it would wipe existing links. " +
  "Omit the field to keep existing, pass [] to explicitly clear all, " +
  "or use manage_record_links to remove specific ids.";

export async function runInteractor<T>(
  result: InteractorResult<T>,
  format: (data: T) => string | McpToolResult,
  structured?: (data: T) => Record<string, unknown>,
): Promise<McpToolResult> {
  const outcome = await result;
  if (!outcome.ok) return mcpInteractorFailure(outcome.error);
  const formatted = format(outcome.data);
  if (typeof formatted !== "string") return formatted;
  if (!structured) return formatted;
  return { text: formatted, structuredContent: structured(outcome.data) };
}

const MIN_NAME_MATCH_TERM_LENGTH = 3;

export function nameMatchNote(
  term: string | undefined,
  items: readonly { name?: string | null }[],
): string | undefined {
  const needle = term?.trim().toLowerCase();
  if (!needle || needle.length < MIN_NAME_MATCH_TERM_LENGTH) return undefined;
  const matches = items.filter((item) => item.name?.toLowerCase().includes(needle)).length;
  if (matches < 2) return undefined;
  return `${matches} records here match the name "${term?.trim()}". If the user meant one record, ask which one before changing anything; if they asked for every match, act on all of them.`;
}

export function nameQueryOf(
  searchTerm: string | undefined,
  filters: readonly unknown[] | undefined,
): string | undefined {
  if (searchTerm?.trim()) return searchTerm;
  for (const raw of filters ?? []) {
    const filter = raw as { field?: unknown; value?: unknown };
    if (filter?.field === "name" && typeof filter.value === "string") return filter.value;
  }
  return undefined;
}

export function toonResult(payload: Record<string, unknown>): McpToolResult {
  return { text: encodeToToon(payload), structuredContent: payload };
}

export const CreatedRecordsOutputSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })).describe("The created records, in input order"),
});

export const UpdatedRecordsOutputSchema = z.object({ updated: z.number() });

export const CUSTOM_COLUMN_PREREQ = "Prereq: call get_record_schema for custom-column ids.";

export const CUSTOM_FIELDS_MERGE_NOTE =
  "customFieldValues is a per-column merge: only columns you include change; to clear one pass { columnId, value: null }. " +
  "A date or dateTime value is an instant: send ISO 8601 carrying the offset of the time the user named, for example 2026-09-14T09:00:00+02:00 for 09:00 Europe/Berlin; a trailing Z means UTC, so never append it to a local time.";

export const IDEMPOTENT_NOTE = "Idempotent: same payload produces the same state.";

export const relationsViaLinkNote = (relations: string) =>
  `Relations (${relations}) are NOT changed here - add or remove them with manage_record_links so existing links are preserved.`;

export const CONTACT_KEY_FIELD_NOTE =
  "For contacts, this may instead be a channel the contact owns: an email (e.g. 'jane@example.com'), " +
  "a phone (e.g. '+491234567890'), or 'provider:value' for a handle where provider is one of linkedin, telegram, " +
  "instagram (e.g. 'linkedin:john-doe').";
