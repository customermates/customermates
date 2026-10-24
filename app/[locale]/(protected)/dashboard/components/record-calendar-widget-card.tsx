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
import { useRecordValueFormat } from "@/components/records/record-value";
import { cn } from "@/core/utils/cn";

import { type CalendarDaySelect, CalendarWidgetMonth } from "./calendar-widget-month";
import { CalendarWidgetUpcoming } from "./calendar-widget-upcoming";
import { WIDGET_CARD_BODY_CLASS, WIDGET_CARD_HEADER_CLASS } from "./widget-card-frame";
import { widgetSourceFilterCount } from "./widget-source-summary";
import { WidgetSubtitle, WidgetTitle } from "./widget-subtitle";
import { WIDGET_INTERACTIVE_ATTRIBUTE } from "./widget-interaction";

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
  onSelectDay?: CalendarDaySelect;
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
  onSelectDay,
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
  const filters = t("Dashboard.widgetEditor.tabs.filtersLabel", {
    count: widgetSourceFilterCount(calendarQuery.source),
  });
  const notes = displayOptions.showFilters
    ? [[list, dateField?.label, range, filters].filter(Boolean).join(" · ")]
    : [];
  const total = data?.total.result;
  const overall =
    !ready || upcoming || !displayOptions.showFilters
      ? null
      : t("RecordWidgets.overall", {
          value:
            calendarQuery.aggregation === "sum" && total?.state === "value" && total.value.kind === "decimal"
              ? valueFormat.decimal(total.value.value, { currency: total.value.currency ?? null, compact: true })
              : t("RecordCalendarWidgets.recordCount", { count: data.total.count }),
        });

  return (
    <AppCard className="h-full cursor-pointer overflow-hidden" data-widget-kind="calendar">
      <AppCardHeader className={WIDGET_CARD_HEADER_CLASS}>
        <WidgetTitle name={name} notes={notes} />

        <WidgetSubtitle reserve text={overall} />
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
          <CalendarWidgetMonth data={data} loadWindow={loadWindow} query={calendarQuery} onSelectDay={onSelectDay} />
        )}
      </AppCardBody>
    </AppCard>
  );
});
