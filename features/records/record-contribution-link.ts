import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import type { Filter } from "@/core/base/base-get.schema";
import type { GetQueryParams } from "@/core/base/base-get.schema";
import { encodeGetParams } from "@/core/utils/get-params";
import { FilterOperatorKey, ViewMode } from "@/core/base/base-query-builder";
import { RecordContributionSchema, type RecordContribution } from "./record-contribution.schema";

export const RECORD_CONTRIBUTION_FILTER = "system:chartContribution";
const MAX_TOKEN_LENGTH = 24_000;

export function encodeRecordContribution(value: RecordContribution): string {
  const bytes = new TextEncoder().encode(JSON.stringify(RecordContributionSchema.parse(value)));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const token = btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
  if (token.length > MAX_TOKEN_LENGTH) throw new Error("Chart filters exceed the navigation limit");
  return token;
}

export function decodeRecordContribution(token: unknown): RecordContribution | null {
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

export function recordContributionHref(
  typeId: string,
  filters: Filter[],
  extra: Pick<GetQueryParams, "searchTerm" | "sortDescriptor"> = {},
): string {
  const params = encodeGetParams({ ...extra, filters, viewMode: ViewMode.table, viewId: ALL_VIEW_KEY, page: 1 });
  params.set("viewMode", ViewMode.table);
  return `/records/${typeId}?${params}`;
}
