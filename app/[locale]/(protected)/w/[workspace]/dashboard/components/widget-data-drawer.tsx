"use client";

import type { AppModalActionProps } from "@/components/modal/app-modal-action";
import type { CalendarDate } from "@/features/record-calendar/calendar-date";
import type { RecordWidgetDto } from "@/features/widget/record-widget.schema";
import type { RecordCalendarWidgetDto } from "@/features/widget/record-calendar-widget.schema";
import type { RecordContributionGroup } from "@/features/records/record-contribution.schema";
import type { RecordExplorationStore } from "../../records/[typeId]/components/record-exploration.store";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Pencil } from "lucide-react";

import { PageState } from "@/components/page-state/page-state";
import { ScopedRecordsSheet } from "@/components/records/scoped-records-sheet";
import { useRootStore } from "@/core/stores/root-store.provider";
import { actionData } from "@/core/utils/action-data";
import { reportApplicationError } from "@/core/errors/report-application-error";
import { cn } from "@/core/utils/cn";
import { recordContributionFilter } from "@/features/records/record-contribution-link";
import { DisplayType } from "@/features/widget/widget-display.schema";
import { isRecordWidget } from "@/features/widget/widget.schema";
import { calendarWidgetDayMeasure } from "@/features/widget/record-calendar-widget-window";
import { getWidgetByIdAction } from "../actions";
import { openWidgetEditor } from "./widget-interaction";
import { RecordWidgetChart } from "./record-widget-chart";
import { CalendarWidgetMonth } from "./calendar-widget-month";
import { readCalendarWindow } from "./widget-card";

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

const LEAD_HEIGHT_CLASS: Partial<Record<DisplayType, string>> = {
  [DisplayType.rankedTable]: "max-h-64",
};

const LEAD_FRAME_CLASS = "flex shrink-0 flex-col px-6 pb-4";

export function WidgetDataDrawer({
  open,
  selection,
  onClose,
  onSelect,
  onSelectDay,
}: {
  open: boolean;
  selection: WidgetDataSelection;
  onClose: () => void;
  onSelect: (group: RecordContributionGroup | null, label: string | null) => void;
  onSelectDay: (date: CalendarDate, label: string) => void;
}) {
  return selection.kind === "calendarDay" ? (
    <CalendarDayDataDrawer open={open} selection={selection} onClose={onClose} onSelectDay={onSelectDay} />
  ) : (
    <MeasureDataDrawer open={open} selection={selection} onClose={onClose} onSelect={onSelect} />
  );
}

function useEditWidgetAction(widgetId: string, name: string, onClose: () => void): AppModalActionProps {
  const root = useRootStore();
  const t = useTranslations();
  return {
    id: "edit-widget",
    label: t("Dashboard.widgetEditor.editTitle", { name }),
    icon: Pencil,
    onClick: () => {
      onClose();
      return openWidgetEditor(root.widgetModalStore, widgetId);
    },
  };
}

function useRecordCount() {
  const t = useTranslations();
  return (store: RecordExplorationStore | null) =>
    store ? t("RecordWidgets.contributingCount", { count: store.pagination?.total ?? store.items.length }) : null;
}

function CalendarDayDataDrawer({
  open,
  selection,
  onClose,
  onSelectDay,
}: {
  open: boolean;
  selection: Extract<WidgetDataSelection, { kind: "calendarDay" }>;
  onClose: () => void;
  onSelectDay: (date: CalendarDate, label: string) => void;
}) {
  const t = useTranslations();
  const count = useRecordCount();
  const { widget, date, label } = selection;
  const editAction = useEditWidgetAction(widget.id, widget.name, onClose);
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
    <ScopedRecordsSheet
      persistAppearance
      actions={[editAction]}
      emptyTitle={t("Diagrams.noData")}
      filter={filter}
      idPrefix="widget-data"
      lead={
        query.layout === "month" ? (
          <div className={cn(LEAD_FRAME_CLASS, "h-72")} data-widget-detail-chart="">
            {widget.status === "ready" && widget.data ? (
              <CalendarWidgetMonth
                data={widget.data}
                loadWindow={(window) => readCalendarWindow(widget.id, window)}
                query={query}
                onSelectDay={(day, dayLabel) => onSelectDay(day, dayLabel)}
              />
            ) : (
              <PageState state="error" title={t("RecordCalendarWidgets.unavailable")} />
            )}
          </div>
        ) : undefined
      }
      open={open}
      opener={selection.opener}
      summary={(store) => [widget.name, count(store)].filter(Boolean).join(" · ")}
      title={label}
      typeId={query.source.typeId}
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
  const count = useRecordCount();
  const { group, label } = selection;
  const [widget, setWidget] = useState(selection.widget);
  const [chartFailed, setChartFailed] = useState(false);
  const editAction = useEditWidgetAction(widget.id, widget.name, onClose);
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
    <ScopedRecordsSheet
      persistAppearance
      actions={[editAction]}
      emptyTitle={t("Diagrams.noData")}
      filter={filter}
      idPrefix="widget-data"
      lead={
        widget.displayOptions.displayType === DisplayType.number ? undefined : (
          <div
            className={cn(LEAD_FRAME_CLASS, LEAD_HEIGHT_CLASS[widget.displayOptions.displayType] ?? "h-56")}
            data-widget-detail-chart=""
          >
            {chartFailed ? (
              <PageState state="error" title={t("RecordWidgets.unavailable")} />
            ) : (
              <RecordWidgetChart {...widget} embedded onInspectGroup={onSelect} />
            )}
          </div>
        )
      }
      open={open}
      opener={selection.opener}
      summary={(store) => [label, count(store)].filter(Boolean).join(" · ")}
      title={widget.name}
      typeId={widget.measure.source.typeId}
      onClose={onClose}
    />
  );
}
