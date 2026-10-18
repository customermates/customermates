"use client";

import type { RecordDisplayField } from "@/features/records/record-display-field.schema";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { CalendarWidgetData, CalendarWidgetItem } from "@/features/widget/record-calendar-widget.schema";

import { Fragment, useId } from "react";
import { CalendarDays } from "lucide-react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { RecordValue, useRecordValueFormat } from "@/components/records/record-value";
import { useNavigateToHref } from "@/components/shared/use-navigate-to-href";
import { SectionRows } from "@/components/ui/section-rows";
import { cn } from "@/core/utils/cn";
import { recordDisplayName } from "@/features/records/record-display-name";

import { calendarMonthKey, calendarOverdueDays } from "./calendar-widget-view";

type Props = {
  data: CalendarWidgetData;
  dateField: RecordDisplayField | undefined;
  amountField: RecordDisplayField | undefined;
  days: number;
  timeZone: string;
  singular: string | undefined;
  recordHref?: (record: RecordRef) => string;
};

const DAY_START = "T00:00:00.000Z";
const SECTION_HEADING_CLASS = "pb-1 text-[11px] font-semibold uppercase tracking-wide";

export const CalendarWidgetUpcoming = observer(function CalendarWidgetUpcoming({
  data,
  dateField,
  amountField,
  days,
  timeZone,
  singular,
  recordHref,
}: Props) {
  const t = useTranslations();
  const valueFormat = useRecordValueFormat();
  const navigateToHref = useNavigateToHref();
  const hiddenOverdue = Math.max(0, data.overdueCount - data.overdue.length);
  const overdueHeadingId = useId();
  const upcomingHeadingId = useId();

  function row(item: CalendarWidgetItem, overdue: boolean) {
    const day = new Date(`${item.date}${DAY_START}`);
    const name = recordDisplayName(item.title, singular, t);
    const fullDate = valueFormat.date(day, { dateStyle: "full", timeZone: "UTC" });
    const time =
      item.value.state === "value" && item.value.value.kind === "dateTime"
        ? valueFormat.date(new Date(item.value.value.value), { hour: "numeric", minute: "2-digit", timeZone })
        : null;
    const detail = overdue
      ? t("RecordCalendarWidgets.overdueBy", { count: calendarOverdueDays(item.date, data.today) })
      : [dateField?.label, time].filter(Boolean).join(" · ");
    const href = recordHref?.(item.record);
    return (
      <li
        key={`${overdue ? "overdue" : "upcoming"}:${item.record.recordId}:${item.date}`}
        className={cn(
          "relative flex items-center gap-3 py-2",
          href && "transition-colors hover:bg-accent has-[>a:focus-visible]:bg-accent",
        )}
        data-calendar-item={item.record.recordId}
        data-overdue={overdue || undefined}
      >
        {href && (
          <a
            aria-label={t("RecordCalendarWidgets.itemLabel", { name, date: fullDate })}
            className="absolute inset-0 outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
            href={href}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.button === 1) return;
              event.preventDefault();
              navigateToHref(href);
            }}
          />
        )}

        <span
          aria-hidden
          className={cn("flex w-10 shrink-0 flex-col items-center gap-1 leading-none", overdue && "text-destructive")}
        >
          <span className="text-base font-semibold tabular-nums">
            {valueFormat.date(day, { day: "numeric", timeZone: "UTC" })}
          </span>

          <span className={cn("text-[10px] uppercase tracking-wide", !overdue && "text-muted-foreground")}>
            {item.date === data.today
              ? t("Common.datePresets.today")
              : valueFormat.date(day, { weekday: "short", timeZone: "UTC" })}
          </span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-sm font-medium">{name}</span>

          {detail && (
            <span className={cn("truncate text-xs", overdue ? "text-destructive" : "text-muted-foreground")}>
              {detail}
            </span>
          )}
        </span>

        {amountField && (
          <span className="shrink-0 text-sm font-medium">
            <RecordValue field={amountField} result={item.amount ?? { state: "missing" }} />
          </span>
        )}
      </li>
    );
  }

  if (data.items.length === 0 && data.overdue.length === 0) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 text-center"
        data-slot="widget-empty"
      >
        <CalendarDays aria-hidden className="size-6 text-muted-foreground/60" />

        <p className="text-sm text-muted-foreground">{t("RecordCalendarWidgets.noUpcoming", { count: days })}</p>
      </div>
    );
  }

  return (
    <div
      className="-mx-4 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain px-4"
      data-calendar-layout="upcoming"
    >
      {data.overdue.length > 0 && (
        <section aria-labelledby={overdueHeadingId} data-calendar-section="overdue">
          <h3 className={cn(SECTION_HEADING_CLASS, "text-destructive")} id={overdueHeadingId}>
            {t("RecordCalendarWidgets.overdue")}
          </h3>

          <SectionRows asChild>
            <ul>{data.overdue.map((item) => row(item, true))}</ul>
          </SectionRows>

          {hiddenOverdue > 0 && (
            <p className="pt-1 text-xs text-destructive">
              {t("RecordCalendarWidgets.moreOverdue", { count: hiddenOverdue })}
            </p>
          )}
        </section>
      )}

      {data.overdue.length > 0 || data.items.length > 0 ? (
        <section aria-labelledby={upcomingHeadingId} data-calendar-section="upcoming">
          <h3
            className={cn(SECTION_HEADING_CLASS, "text-muted-foreground", data.overdue.length === 0 && "sr-only")}
            id={upcomingHeadingId}
          >
            {t("RecordCalendarWidgets.nextDays", { count: days })}
          </h3>

          {data.items.length === 0 ? (
            <p className="py-2 text-xs text-muted-foreground">
              {t("RecordCalendarWidgets.noUpcoming", { count: days })}
            </p>
          ) : (
            <SectionRows asChild>
              <ul>
                {data.items.map((item, index) => {
                  const month = calendarMonthKey(item.date);
                  const startsMonth =
                    index > 0
                      ? calendarMonthKey(data.items[index - 1].date) !== month
                      : month !== calendarMonthKey(data.today);
                  return (
                    <Fragment key={`${item.record.recordId}:${item.date}`}>
                      {startsMonth && (
                        <li
                          className="pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
                          data-calendar-month={month}
                        >
                          {valueFormat.date(new Date(`${item.date}${DAY_START}`), {
                            month: "long",
                            year: "numeric",
                            timeZone: "UTC",
                          })}
                        </li>
                      )}

                      {row(item, false)}
                    </Fragment>
                  );
                })}
              </ul>
            </SectionRows>
          )}
        </section>
      ) : null}

      {data.truncated && (
        <p className="text-xs text-muted-foreground" data-calendar-truncated="">
          {t("RecordCalendarWidgets.truncated", { count: data.items.length })}
        </p>
      )}
    </div>
  );
});
