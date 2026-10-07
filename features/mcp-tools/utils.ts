import { z } from "zod";
import { encode } from "@toon-format/toon";
import { getTranslations } from "next-intl/server";

import type { CustomErrorCode } from "@/core/validation/validation.types";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import {
  createZodError,
  interactorFailureKind,
  type InteractorFailureKind,
  type InteractorResult,
} from "@/core/validation/validation.utils";

import {
  mcpFailureText,
  mcpInteractorFailure,
  mcpValidationFailure,
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

export const MCP_PAGE_SIZE_DESCRIPTION =
  "Results per page, any whole number from 1 to 100, served exactly: page 2 of pageSize 50 holds records 51 to 100. When a result was truncated, ask again with about half the size.";

export const McpPageOutputShape = {
  page: z.number().describe("The page returned, counted in pageSize"),
  pageSize: z.number().describe("The page size asked for; every page but the last holds exactly this many records"),
};

export const ProviderTotalSchema = z
  .number()
  .optional()
  .describe("The provider's count of every matching row, present only when the provider reports one");

export function providerTotal(totalCount: number | null | undefined): { total?: number } {
  return typeof totalCount === "number" ? { total: totalCount } : {};
}

export const mcpPageSize = (
  defaultValue: McpPageSize,
  describe = `${MCP_PAGE_SIZE_DESCRIPTION} Default ${defaultValue}.`,
) => z.coerce.number().int().min(1).max(100).default(defaultValue).describe(describe);

export const mcpOptionalPageSize = (describe: string) =>
  z.coerce.number().int().min(1).max(100).optional().describe(describe);

type McpPageFetchPlan = { page: number; pageSize: McpPageSize; offset: number; spans: 1 | 2 };

export function planMcpPageFetch(page: number, pageSize: number): McpPageFetchPlan {
  const start = (page - 1) * pageSize;
  const last = start + pageSize - 1;
  const covering = MCP_PAGE_SIZES.filter((size) => size >= pageSize);
  const single = covering.find((size) => Math.floor(start / size) === Math.floor(last / size));
  const size = single ?? covering[0];
  return { page: Math.floor(start / size) + 1, pageSize: size, offset: start % size, spans: single ? 1 : 2 };
}

type McpPageOutcome = { ok: boolean; data?: { items: readonly unknown[] } };

export async function fetchMcpPage<R extends McpPageOutcome>(
  request: { page: number; pageSize: number },
  fetchPage: (pagination: { page: number; pageSize: McpPageSize }) => Promise<R>,
): Promise<R> {
  const plan = planMcpPageFetch(request.page, request.pageSize);
  const first = await fetchPage({ page: plan.page, pageSize: plan.pageSize });
  if (!first.ok || !first.data) return first;
  let items = first.data.items.slice(plan.offset);
  if (plan.spans === 2 && first.data.items.length === plan.pageSize) {
    const next = await fetchPage({ page: plan.page + 1, pageSize: plan.pageSize });
    if (!next.ok || !next.data) return next;
    items = [...items, ...next.data.items];
  }
  return { ...first, data: { ...first.data, items: items.slice(0, request.pageSize) } } as R;
}

export const mcpPage = (maximum?: number) => {
  const page = z.coerce.number().int().min(1);
  const bounded = maximum === undefined ? page : page.max(maximum);

  return bounded.default(1).describe("1-indexed page number");
};

async function translatedErrorMessage(code: CustomErrorCode, values?: Record<string, string>): Promise<string> {
  const t = await getTranslations("Common.errors");
  let message = t.raw(code) as string;
  if (values) for (const [key, value] of Object.entries(values)) message = message.replaceAll(`{${key}}`, value);
  return message;
}

function customErrorText(kind: InteractorFailureKind, message: string): string {
  return kind === "validation" ? `${VALIDATION_ERROR_PREFIX} ${message}` : message;
}

export function nestedValidationErrorText(error: z.ZodError): string {
  return mcpFailureText(error);
}

export async function nestedCustomErrorText(code: CustomErrorCode, values?: Record<string, string>): Promise<string> {
  const message = await translatedErrorMessage(code, values);
  return customErrorText(interactorFailureKind(createZodError(message, [], { ...values, error: code })), message);
}

export async function customMcpFailure(
  code: CustomErrorCode,
  values?: Record<string, string>,
  path: Array<string | number> = [],
): Promise<McpToolFailureResult> {
  const message = await translatedErrorMessage(code, values);
  const failure = mcpInteractorFailure(createZodError(message, path, { ...values, error: code }));
  return { ...failure, text: customErrorText(failure.failure.kind, message) };
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
  multiValue: [
    FilterOperatorKey.in,
    FilterOperatorKey.notIn,
    FilterOperatorKey.between,
    FilterOperatorKey.hasAnyOf,
    FilterOperatorKey.hasAllOf,
    FilterOperatorKey.hasNoneOf,
  ],
  relativeWindow: [FilterOperatorKey.inLastDays, FilterOperatorKey.notInLastDays],
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
    { field: "<multiple-choice-custom-column-uuid>", operator: "hasAllOf", value: ["<option-uuid>", "<option-uuid>"] },
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
    singleSelect:
      "by option order, as listed in the column's options (desc reverses it); a stored value that is no longer an option sorts after the known options in either direction",
  },
  nullHandling: "rows missing the value sort last regardless of direction",
  examples: [
    { field: "name", direction: "asc" },
    { field: "createdAt", direction: "desc" },
    { field: "<custom-column-uuid>", direction: "asc" },
  ],
};

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

const NAME_FILTER_FIELDS: readonly unknown[] = [FilterFieldKey.name, FilterFieldKey.firstName, FilterFieldKey.lastName];

export function nameQueryOf(
  searchTerm: string | undefined,
  filters: readonly unknown[] | undefined,
): string | undefined {
  if (searchTerm?.trim()) return searchTerm;
  const names = (filters ?? []).flatMap((raw) => {
    const filter = raw as { field?: unknown; value?: unknown };
    return NAME_FILTER_FIELDS.includes(filter?.field) && typeof filter.value === "string" ? [filter.value] : [];
  });
  return names.length > 0 ? names.join(" ") : undefined;
}

export function toonResult(payload: Record<string, unknown>): McpToolResult {
  return { text: encodeToToon(payload), structuredContent: payload };
}
