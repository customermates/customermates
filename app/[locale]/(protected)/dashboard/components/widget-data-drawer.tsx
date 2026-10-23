"use client";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

import type { Filter } from "@/core/base/base-get.schema";
import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import type { RecordCalendarWidgetDto } from "@/features/widget/record-calendar-widget.schema";
import type { RecordContributionGroup } from "@/features/records/record-contribution.schema";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { ReactNode } from "react";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";
import { AppModal } from "@/components/modal/app-modal";
import { AppCard } from "@/components/card/app-card";
import { AppCardBody } from "@/components/card/app-card-body";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageState } from "@/components/page-state/page-state";
import { useRootStore } from "@/core/stores/root-store.provider";
import { ViewMode } from "@/core/base/base-query-builder";
import { actionData } from "@/core/utils/action-data";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { recordContributionFilter } from "@/features/records/record-contribution-link";
import { getWidgetByIdAction } from "../actions";
import { isRecordWidget } from "@/features/widget/widget.schema";
import { calendarWidgetDayMeasure } from "@/features/widget/record-calendar-widget-window";
import { getRecordPresentationAction } from "../../records/actions";
import { openWidgetEditor } from "./widget-interaction";
import { RecordWidgetChart } from "./record-widget-chart";
import { WidgetRecordsTable } from "./widget-records-table";

export type WidgetDataSelection =
  | {
      kind: "measure";
      widget: RecordWidgetDto;
      group: RecordContributionGroup | null;
      label: string | null;
      opener: HTMLElement | null;
    }
  | {
      kind: "calendarDay";
      widget: RecordCalendarWidgetDto;
      date: CalendarDate;
      label: string;
      opener: HTMLElement | null;
    };

export function WidgetDataDrawer({
  open,
  selection,
  onClose,
  onSelect,
}: {
  open: boolean;
  selection: WidgetDataSelection;
  onClose: () => void;
  onSelect: (group: RecordContributionGroup | null, label: string | null) => void;
}) {
  return selection.kind === "calendarDay" ? (
    <CalendarDayDataDrawer open={open} selection={selection} onClose={onClose} />
  ) : (
    <MeasureDataDrawer open={open} selection={selection} onClose={onClose} onSelect={onSelect} />
  );
}

function CalendarDayDataDrawer({
  open,
  selection,
  onClose,
}: {
  open: boolean;
  selection: Extract<WidgetDataSelection, { kind: "calendarDay" }>;
  onClose: () => void;
}) {
  const t = useTranslations();
  const { widget, date, label } = selection;
  const query = widget.calendarQuery;
  const dateField = widget.fields.find((field) => field.id === query.dateFieldId);
  const filter = useMemo(() => {
    if (!dateField) return null;
    try {
      return recordContributionFilter({
        measure: calendarWidgetDayMeasure(query, dateField, date),
        group: null,
        title: widget.name,
        groupLabel: label,
      });
    } catch {
      return null;
    }
  }, [query, dateField, date, widget.name, label]);
  return (
    <WidgetDataSheet
      filter={filter}
      header={
        <div className="flex shrink-0 flex-col gap-1 py-5 pr-28 pl-4" data-widget-detail-day={date}>
          <p className="truncate text-base font-semibold">{label}</p>

          <p className="truncate text-sm text-muted-foreground">{widget.name}</p>
        </div>
      }
      open={open}
      opener={selection.opener}
      title={t("RecordCalendarWidgets.dayDataTitle", { name: widget.name, date: label })}
      typeId={query.source.typeId}
      widgetId={widget.id}
      widgetName={widget.name}
      onClose={onClose}
    />
  );
}

function MeasureDataDrawer({
  open,
  selection,
  onClose,
  onSelect,
}: {
  open: boolean;
  selection: Extract<WidgetDataSelection, { kind: "measure" }>;
  onClose: () => void;
  onSelect: (group: RecordContributionGroup | null, label: string | null) => void;
}) {
  const root = useRootStore();
  const t = useTranslations();
  const { group, label } = selection;
  const [widget, setWidget] = useState(selection.widget);
  const [chartFailed, setChartFailed] = useState(false);
  useEffect(
    () =>
      root.recordWorkspaceStore.subscribe(async () => {
        try {
          const updated = await actionData(getWidgetByIdAction({ id: selection.widget.id }));
          if (!updated || !isRecordWidget(updated)) {
            setChartFailed(true);
            return;
          }
          setWidget(updated);
          setChartFailed(false);
        } catch (cause) {
          setChartFailed(true);
          reportApplicationError(cause);
        }
      }),
    [root, selection.widget.id],
  );
  const filter = useMemo(() => {
    try {
      return recordContributionFilter({ measure: widget.measure, group, title: widget.name, groupLabel: label });
    } catch {
      return null;
    }
  }, [widget.measure, widget.name, group, label]);
  return (
    <WidgetDataSheet
      filter={filter}
      header={
        <div className="flex h-64 shrink-0 flex-col" data-widget-detail-chart="">
          {chartFailed ? (
            <PageState state="error" title={t("RecordWidgets.unavailable")} />
          ) : (
            <RecordWidgetChart {...widget} onInspectGroup={onSelect} />
          )}
        </div>
      }
      open={open}
      opener={selection.opener}
      title={t("RecordWidgets.dataTitle", { name: widget.name })}
      typeId={widget.measure.source.typeId}
      widgetId={widget.id}
      widgetName={widget.name}
      onClose={onClose}
    />
  );
}

function WidgetDataSheet({
  open,
  widgetId,
  widgetName,
  title,
  typeId,
  filter,
  opener,
  header,
  onClose,
}: {
  open: boolean;
  widgetId: string;
  widgetName: string;
  title: string;
  typeId: string;
  filter: Filter | null;
  opener: HTMLElement | null;
  header: ReactNode;
  onClose: () => void;
}) {
  const root = useRootStore();
  const t = useTranslations();
  const [presentation, setPresentation] = useState<{ key: string; data: RecordPresentationResult } | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const key = filter && "value" in filter ? String(filter.value) : "";
  useEffect(() => {
    let active = true;
    setError(!filter);
    if (!filter) return;
    actionData(
      getRecordPresentationAction(typeId, {
        filters: [filter],
        searchTerm: "",
        viewMode: ViewMode.table,
        grouping: null,
        page: 1,
        pageSize: 10,
        viewId: ALL_VIEW_KEY,
      }),
    )
      .then((data) => {
        if (active) setPresentation({ key, data });
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(true);
          reportApplicationError(cause);
        }
      });
    return () => {
      active = false;
    };
  }, [key, filter, typeId, attempt]);
  return (
    <AppModal
      sheet
      actions={[
        {
          id: "edit-widget",
          label: t("Dashboard.widgetEditor.editTitle", { name: widgetName }),
          icon: Pencil,
          onClick: () => {
            onClose();
            return openWidgetEditor(root.widgetModalStore, widgetId);
          },
        },
      ]}
      bodyClassName="flex min-h-0 flex-col overflow-hidden p-0"
      focusReturnTarget={opener}
      open={open}
      size="5xl"
      title={title}
      onClose={onClose}
    >
      <AppCard className="flex min-h-0 flex-1 flex-col">
        {header}

        <AppCardBody className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          {error ? (
            <PageState
              action={
                <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                  {t("ErrorCard.retry")}
                </Button>
              }
              state="error"
              title={t("RecordWidgets.unavailable")}
            />
          ) : presentation?.key === key ? (
            <WidgetRecordsTable key={key} presentation={presentation.data} />
          ) : (
            <div aria-label={t("Loading.text")} className="space-y-3" role="status">
              <Skeleton className="h-9" />

              <Skeleton className="h-48" />
            </div>
          )}
        </AppCardBody>
      </AppCard>
    </AppModal>
  );
}
