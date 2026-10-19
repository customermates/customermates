"use client";

import type { CalendarWidgetWindow } from "@/features/widget/record-calendar-widget.schema";
import type { WidgetDto } from "@/features/widget/widget.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { openWidgetEditor } from "./widget-interaction";

import { runUserAction } from "@/core/errors/report-application-error";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { useRootStore } from "@/core/stores/root-store.provider";
import {
  isRecordActivityWidget,
  isRecordCalendarWidget,
  isRecordMapWidget,
  isRecordWidget,
} from "@/features/widget/widget.schema";
import { readCalendarWidgetWindowAction } from "../actions";
import { RecordActivityWidgetCard } from "./record-activity-widget-card";
import { RecordCalendarWidgetCard, recordPageHref } from "./record-calendar-widget-card";
import { RecordMapWidgetCard } from "./record-map-widget-card";
import { RecordWidgetCard } from "./record-widget-card";

type Props = {
  widget: WidgetDto;
};

async function readCalendarWindow(id: string, window: CalendarWidgetWindow) {
  const result = await readCalendarWidgetWindowAction(id, window);
  if (!result.ok) notifyIfWorkspaceChanged(result);
  if (!result.ok || !isRecordCalendarWidget(result.data) || !result.data.data)
    throw new Error("Calendar widget window unavailable");
  return { data: result.data.data, fields: result.data.fields };
}

export const WidgetCard = observer(({ widget }: Props) => {
  const t = useTranslations();
  const { widgetModalStore, recordWorkspaceStore } = useRootStore();
  const listLabels = (typeId: string) => recordWorkspaceStore.navigation?.types.find((type) => type.id === typeId);
  const card = isRecordActivityWidget(widget) ? (
    <RecordActivityWidgetCard widget={widget} />
  ) : isRecordCalendarWidget(widget) ? (
    <RecordCalendarWidgetCard
      calendarQuery={widget.calendarQuery}
      data={widget.data}
      displayOptions={widget.displayOptions}
      fields={widget.fields}
      listLabels={listLabels(widget.calendarQuery.source.typeId)}
      loadWindow={(window) => readCalendarWindow(widget.id, window)}
      name={widget.name}
      recordHref={recordPageHref}
      status={widget.status}
      onOpenFilters={() => runUserAction(() => widgetModalStore.openWithFilter(widget.id, "filters"))}
    />
  ) : isRecordMapWidget(widget) ? (
    <RecordMapWidgetCard
      data={widget.data}
      displayOptions={widget.displayOptions}
      fields={widget.fields}
      listLabels={listLabels(widget.mapQuery.source.typeId)}
      mapQuery={widget.mapQuery}
      name={widget.name}
      recordHref={recordPageHref}
      status={widget.status}
      onOpenFilters={() => runUserAction(() => widgetModalStore.openWithFilter(widget.id, "filters"))}
    />
  ) : isRecordWidget(widget) ? (
    <RecordWidgetCard
      {...widget}
      listLabels={recordWorkspaceStore.navigation?.types.find((type) => type.id === widget.measure.source.typeId)}
    />
  ) : null;

  return (
    <div className="relative h-full">
      <button
        aria-label={t("Dashboard.widgetEditor.editTitle", {
          name: widget.name,
        })}
        className="pointer-events-none absolute inset-0 z-20 rounded-xl opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
        data-slot="widget-card-open"
        type="button"
        onClick={() => runUserAction(() => openWidgetEditor(widgetModalStore, widget.id))}
      />

      {card}
    </div>
  );
});
