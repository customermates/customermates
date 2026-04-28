import { z } from "zod";
import { encode } from "@toon-format/toon";

export function encodeToToon(data: unknown): string {
  try {
    return encode(data);
  } catch (error) {
    return String(error);
  }
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
  "Call get_entity_configuration to see all filterable fields.";

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
          code: z.ZodIssueCode.custom,
          path: [field],
          message:
            `Refusing to set '${field}' to null — that would wipe the relationship. ` +
            `Omit the field to keep existing links, pass [] to explicitly clear, ` +
            `or use unlink_entities to remove specific ids.`,
        });
      }
    }
  });
}

export const NO_NULL_WIPE_WARNING =
  "NEVER pass null on relationship arrays — it would wipe existing links. " +
  "Omit the field to keep existing, pass [] to explicitly clear all, " +
  "or use unlink_entities to remove specific ids.";
