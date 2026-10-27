import type { RecordRef } from "@/features/records/record-model.schema";

export const WIDGET_CARD_HEADER_CLASS = "flex-col items-start gap-0.5 px-4 pt-3.5";
export const WIDGET_CARD_TITLE_CLASS = "text-x-sm w-full font-medium";
export const WIDGET_CARD_BODY_CLASS = "px-4 pb-3.5 pt-2.5 [--section-inset:--spacing(4)]";

export function widgetSourceFilterCount(source: {
  filters: readonly unknown[];
  relationships: readonly unknown[];
  relatedFilters?: readonly unknown[];
}) {
  return source.filters.length + source.relationships.length + (source.relatedFilters?.length ?? 0);
}

export function recordPageHref(record: RecordRef) {
  return `/records/${record.typeId}/${record.recordId}`;
}
