"use client";

import type { RecordDisplayField } from "@/features/records/record-display-field.schema";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { CalendarWidgetPreview } from "@/features/widget/preview-record-calendar-widget.interactor";
import type {
  CalendarWidgetData,
  CalendarWidgetQuery,
  CalendarWidgetWindow,
} from "@/features/widget/record-calendar-widget.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { AppCardHeader } from "@/components/card/app-card-header";
import { AppChip } from "@/components/chip/app-chip";
import { useRecordValueFormat } from "@/components/records/record-value";
import { cn } from "@/core/utils/cn";

import { CalendarWidgetMonth } from "./calendar-widget-month";
import { CalendarWidgetUpcoming } from "./calendar-widget-upcoming";
import { WIDGET_CARD_BODY_CLASS, WIDGET_CARD_HEADER_CLASS, WIDGET_CARD_TITLE_CLASS } from "./widget-card-frame";
import { WidgetSourceSummary } from "./widget-source-summary";
import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";
import { TruncatedText } from "@/components/shared/truncated-text";

export type RecordCalendarWidgetCardProps = {
  name: string;
  calendarQuery: CalendarWidgetQuery;
  displayOptions: { showFilters: boolean };
  status: "ready" | "unavailable";
  data: CalendarWidgetData | null;
  fields: RecordDisplayField[];
  listLabels?: { label: string; pluralLabel: string } | null;
  loadWindow: (window: CalendarWidgetWindow) => Promise<CalendarWidgetPreview>;
  recordHref?: (record: RecordRef) => string;
  onOpenFilters?: () => void;
};

export function recordPageHref(record: RecordRef) {
  return `/records/${record.typeId}/${record.recordId}`;
}

export const RecordCalendarWidgetCard = observer(function RecordCalendarWidgetCard({
  name,
  calendarQuery,
  displayOptions,
  status,
  data,
  fields,
  listLabels = null,
  loadWindow,
  recordHref,
  onOpenFilters,
}: RecordCalendarWidgetCardProps) {
  const t = useTranslations();
  const valueFormat = useRecordValueFormat();
  const dateField = fields.find((field) => field.id === calendarQuery.dateFieldId);
  const amountField = calendarQuery.amountFieldId
    ? fields.find((field) => field.id === calendarQuery.amountFieldId)
    : undefined;
  const upcoming = calendarQuery.layout === "upcoming";
  const ready = status === "ready" && data !== null;
  const list = listLabels?.pluralLabel ?? null;
  const range = upcoming
    ? t("RecordCalendarWidgets.nextDays", { count: calendarQuery.days })
    : calendarQuery.aggregation === "sum" && amountField
      ? t("RecordCalendarWidgets.sumOf", { field: amountField.label })
      : t("RecordCalendarWidgets.countPerDay");
  const summary = [list, dateField?.label, range].filter(Boolean).join(" · ");
  const total = data?.total.result;
  const chip = !ready ? null : upcoming ? (
    data.overdueCount > 0 ? (
      <AppChip variant="destructive">{t("RecordCalendarWidgets.overdueCount", { count: data.overdueCount })}</AppChip>
    ) : null
  ) : calendarQuery.aggregation === "sum" && total?.state === "value" && total.value.kind === "decimal" ? (
    <AppChip>
      {t("RecordCalendarWidgets.sumTotal", {
        value: valueFormat.decimal(total.value.value, { currency: total.value.currency ?? null, compact: true }),
      })}
    </AppChip>
  ) : (
    <AppChip>{t("RecordCalendarWidgets.recordCount", { count: data.total.count })}</AppChip>
  );

  return (
    <AppCard className="h-full cursor-pointer overflow-hidden" data-widget-kind="calendar">
      <AppCardHeader className={WIDGET_CARD_HEADER_CLASS}>
        <div className="flex w-full min-w-0 items-center gap-2">
          <h2 className={cn(WIDGET_CARD_TITLE_CLASS, "min-w-0 flex-1")}>
            <TruncatedText>{name}</TruncatedText>
          </h2>

          {chip && <span className="shrink-0">{chip}</span>}
        </div>

        {displayOptions.showFilters && (
          <WidgetSourceSummary source={calendarQuery.source} summary={summary} onOpenFilters={onOpenFilters} />
        )}
      </AppCardHeader>

      <AppCardBody
        className={cn(WIDGET_CARD_BODY_CLASS, "min-h-0 flex-1")}
        {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}
      >
        {!ready ? (
          <p className="text-sm text-muted-foreground" role="status">
            {t("RecordCalendarWidgets.unavailable")}
          </p>
        ) : upcoming ? (
          <CalendarWidgetUpcoming
            amountField={amountField}
            data={data}
            dateField={dateField}
            days={calendarQuery.days}
            recordHref={recordHref}
            singular={listLabels?.label}
            timeZone={calendarQuery.timeZone}
          />
        ) : (
          <CalendarWidgetMonth
            amountField={amountField}
            data={data}
            loadWindow={loadWindow}
            query={calendarQuery}
            recordHref={recordHref}
            singular={listLabels?.label}
          />
        )}
      </AppCardBody>
    </AppCard>
  );
});
