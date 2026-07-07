import { z } from "zod";
import { encode } from "@toon-format/toon";
import { getTranslations } from "next-intl/server";

import type { CustomErrorCode } from "@/core/validation/validation.types";

export function encodeToToon(data: unknown): string {
  try {
    return encode(data);
  } catch (error) {
    return String(error);
  }
}

const PAGE_SIZE_VALUES = z.literal([5, 10, 25, 100]);

export const mcpPageSize = (defaultValue: 5 | 10 | 25 | 100, describe: string) =>
  z
    .preprocess((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : v), PAGE_SIZE_VALUES)
    .default(defaultValue)
    .describe(describe);

export const mcpPage = () => z.coerce.number().int().min(1).default(1).describe("1-indexed page number");

export const VALIDATION_ERROR_PREFIX = "Validation error:";

export const validationError = (error: z.ZodError): string => `${VALIDATION_ERROR_PREFIX} ${z.prettifyError(error)}`;

export async function customErrorMessage(code: CustomErrorCode, values?: Record<string, string>): Promise<string> {
  const t = await getTranslations("Common.errors");
  let message = t.raw(code) as string;
  if (values) for (const [key, value] of Object.entries(values)) message = message.replaceAll(`{${key}}`, value);
  return `${VALIDATION_ERROR_PREFIX} ${message}`;
}

function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return String(date);
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatDatesRecursively(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  if (value instanceof Date) return formatDate(value);

  if (typeof value === "string") {
    const dateTimeResult = z.iso.datetime().safeParse(value);
    const dateResult = z.iso.date().safeParse(value);
    if (dateTimeResult.success || dateResult.success) return formatDate(value);
  }

  if (Array.isArray(value)) return value.map(formatDatesRecursively);

  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) result[key] = formatDatesRecursively(val);

    return result;
  }

  return value;
}

export function formatDatesInResponse<T>(data: T): T {
  return formatDatesRecursively(data) as T;
}

export const FILTER_SYNTAX = {
  operators: {
    string: ["equals", "contains", "gt", "gte", "lt", "lte"],
    array: ["in", "notIn", "hasNone", "hasSome"],
    range: ["between"],
    noValue: ["isNull", "isNotNull"],
  },
  examples: [
    { field: "status", operator: "equals", value: "active" },
    { field: "createdAt", operator: "between", value: ["2024-01-01", "2024-12-31"] },
    { field: "assigneeId", operator: "in", value: ["id1", "id2"] },
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
  "Operators: equals, contains, gt, gte, lt, lte, in, notIn, between, isNull, isNotNull, hasNone, hasSome. " +
  'Example: [{"field":"name","operator":"contains","value":"acme"},{"field":"createdAt","operator":"gte","value":"2024-01-01"}]. ' +
  "Call get_record_schema to see all filterable fields.";

export const filtersDescription = (filterableFields: string) =>
  "Array of filter rules, AND-combined. Each rule is { field, operator, value? }. " +
  "Use only the operators listed in each field's hint; value-less operators take no value. " +
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
  result: Promise<{ ok: true; data: T } | { ok: false; error: Parameters<typeof validationError>[0] }>,
  format: (data: T) => string,
): Promise<string> {
  const outcome = await result;
  return outcome.ok ? format(outcome.data) : validationError(outcome.error);
}

export const CUSTOM_COLUMN_PREREQ = "Prereq: call get_record_schema for custom-column ids.";

export const CUSTOM_FIELDS_MERGE_NOTE =
  "customFieldValues is a per-column merge: only columns you include change; to clear one pass { columnId, value: null }.";

export const IDEMPOTENT_NOTE = "Idempotent: same payload produces the same state.";

export const relationsViaLinkNote = (relations: string) =>
  `Relations (${relations}) are NOT changed here - add or remove them with manage_record_links so existing links are preserved.`;

export const CONTACT_KEY_FIELD_NOTE =
  "For contacts, this may instead be a channel the contact owns: an email (e.g. 'jane@example.com'), " +
  "a phone (e.g. '+491234567890'), or 'provider:value' for a handle where provider is one of linkedin, telegram, " +
  "instagram (e.g. 'linkedin:john-doe').";
