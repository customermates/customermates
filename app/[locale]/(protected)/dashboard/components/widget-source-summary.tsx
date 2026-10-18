"use client";

import type { CalendarWidgetQuery } from "@/features/widget/record-calendar-widget.schema";

import { useTranslations } from "next-intl";

import { TruncatedText } from "@/components/shared/truncated-text";

import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";

type Props = {
  source: CalendarWidgetQuery["source"];
  summary: string;
  onOpenFilters?: () => void;
};

export function widgetSourceFilterCount(source: CalendarWidgetQuery["source"]) {
  return source.filters.length + source.relationships.length + (source.relatedFilters?.length ?? 0);
}

export function WidgetSourceSummary({ source, summary, onOpenFilters }: Props) {
  const t = useTranslations();
  const label = t("Dashboard.widgetEditor.tabs.filtersLabel", { count: widgetSourceFilterCount(source) });

  return (
    <div className="flex w-full min-w-0 items-center gap-1.5 text-xs text-muted-foreground" data-slot="widget-subtitle">
      {summary && <TruncatedText className="min-w-0">{summary}</TruncatedText>}

      {summary && <span aria-hidden>·</span>}

      {onOpenFilters ? (
        <button
          className="shrink-0 whitespace-nowrap rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          data-slot="widget-filter-summary"
          type="button"
          {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}
          onClick={onOpenFilters}
        >
          {label}
        </button>
      ) : (
        <span className="shrink-0 whitespace-nowrap" data-slot="widget-filter-summary">
          {label}
        </span>
      )}
    </div>
  );
}
