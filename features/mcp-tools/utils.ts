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
    array: ["in", "notIn"],
    range: ["between"],
    noValue: ["isNull", "isNotNull", "hasNone", "hasSome"],
  },
  examples: [
    { field: "status", operator: "equals", value: "active" },
    { field: "createdAt", operator: "between", value: ["2024-01-01", "2024-12-31"] },
    { field: "assigneeId", operator: "in", value: ["id1", "id2"] },
    { field: "email", operator: "isNotNull" },
  ],
};
