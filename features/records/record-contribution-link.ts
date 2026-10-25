import type { Filter } from "@/core/base/base-get.schema";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { RecordContributionSchema, type RecordContribution } from "./record-contribution.schema";

export const RECORD_CONTRIBUTION_FILTER = "system:chartContribution";
const MAX_TOKEN_LENGTH = 24_000;

function encodeRecordContribution(value: RecordContribution): string {
  const bytes = new TextEncoder().encode(JSON.stringify(RecordContributionSchema.parse(value)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const token = btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
  if (token.length > MAX_TOKEN_LENGTH) throw new Error("Chart filters exceed the navigation limit");
  return token;
}

function decodeRecordContribution(token: unknown): RecordContribution | null {
  if (typeof token !== "string" || token.length > MAX_TOKEN_LENGTH || !/^[\w-]+$/u.test(token)) return null;
  try {
    const bytes = Uint8Array.from(atob(token.replace(/-/gu, "+").replace(/_/gu, "/")), (char) => char.charCodeAt(0));
    const result = RecordContributionSchema.safeParse(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function recordContributionFilter(value: RecordContribution): Filter {
  return {
    field: RECORD_CONTRIBUTION_FILTER,
    operator: FilterOperatorKey.equals,
    value: encodeRecordContribution(value),
  };
}

export function recordContributionFromFilter(filter: Filter): RecordContribution | null {
  return filter.field === RECORD_CONTRIBUTION_FILTER &&
    filter.operator === FilterOperatorKey.equals &&
    "value" in filter
    ? decodeRecordContribution(filter.value)
    : null;
}
