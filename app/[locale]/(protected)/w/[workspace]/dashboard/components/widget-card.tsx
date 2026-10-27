"use client";

import type { RecordContributionGroup } from "@/features/records/record-contribution.schema";
import type { CalendarWidgetWindow } from "@/features/widget/record-calendar-widget.schema";
import type { WidgetDto } from "@/features/widget/widget.schema";
import type { CalendarDaySelect } from "./calendar-widget-month";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { Pencil, Table2 } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { ITEM_REVEAL_CLASS, ITEM_REVEAL_GROUP_CLASS, ItemActions } from "@/components/ui/item-actions";
import { runUserAction } from "@/core/errors/report-application-error";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { useRootStore } from "@/core/stores/root-store.provider";
import { cn } from "@/core/utils/cn";
import {
  isRecordActivityWidget,
  isRecordCalendarWidget,
  isRecordMapWidget,
  isRecordWidget,
} from "@/features/widget/widget.schema";
import { readCalendarWidgetWindowAction } from "../actions";
import { RecordActivityWidgetCard } from "./record-activity-widget-card";
import { RecordCalendarWidgetCard } from "./record-calendar-widget-card";
import { recordPageHref } from "./widget-card-frame";
import { RecordMapWidgetCard } from "./record-map-widget-card";
import { RecordWidgetCard } from "./record-widget-card";
import { WIDGET_INTERACTIVE_ATTRIBUTE, openWidgetEditor } from "./widget-interaction";

type Props = {
  widget: WidgetDto;
  onInspect?: (group: RecordContributionGroup | null, label: string | null) => void;
  onInspectDay?: CalendarDaySelect;
};

export async function readCalendarWindow(id: string, window: CalendarWidgetWindow) {
  const result = await readCalendarWidgetWindowAction(id, window);
  if (!result.ok) notifyIfWorkspaceChanged(result);
  if (!result.ok || !isRecordCalendarWidget(result.data) || !result.data.data)
    throw new Error("Calendar widget window unavailable");
  return { data: result.data.data, fields: result.data.fields };
}

export const WidgetCard = observer(({ widget, onInspect, onInspectDay }: Props) => {
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
      onSelectDay={onInspectDay}
    />
  ) : isRecordMapWidget(widget) ? (
    <RecordMapWidgetCard
      openRecords
      data={widget.data}
      displayOptions={widget.displayOptions}
      fields={widget.fields}
      listLabels={listLabels(widget.mapQuery.source.typeId)}
      mapQuery={widget.mapQuery}
      name={widget.name}
      status={widget.status}
    />
  ) : isRecordWidget(widget) ? (
    <RecordWidgetCard {...widget} listLabels={listLabels(widget.measure.source.typeId)} onInspectGroup={onInspect} />
  ) : null;

  const edit = () => runUserAction(() => openWidgetEditor(widgetModalStore, widget.id));
  const menu = (
    <>
      {onInspect && (
        <DropdownMenuItem onSelect={() => onInspect(null, null)}>
          <Table2 aria-hidden className="size-4" />

          {t("RecordWidgets.viewData")}
        </DropdownMenuItem>
      )}

      <DropdownMenuItem onSelect={edit}>
        <Pencil aria-hidden className="size-4" />

        {t("Dashboard.widgetEditor.editTitle", { name: widget.name })}
      </DropdownMenuItem>
    </>
  );
  return (
    <ItemActions label={t("RecordModel.moreActions", { name: widget.name })} menu={menu}>
      <div className={cn(ITEM_REVEAL_GROUP_CLASS, "relative h-full [&_[data-slot=card-header]]:pr-10")}>
        <button
          aria-label={
            onInspect
              ? t("RecordWidgets.dataTitle", { name: widget.name })
              : t("Dashboard.widgetEditor.editTitle", { name: widget.name })
          }
          className="pointer-events-none absolute inset-0 z-20 rounded-xl opacity-0 outline-none focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring/50"
          data-slot="widget-card-open"
          type="button"
          onClick={() => (onInspect ? onInspect(null, null) : edit())}
        />

        {card}

        <div className="absolute top-2 right-2 z-30" {...{ [WIDGET_INTERACTIVE_ATTRIBUTE]: "true" }}>
          <IconButton
            className={cn("size-7", ITEM_REVEAL_CLASS)}
            icon={Pencil}
            iconClassName="size-3.5"
            label={t("Dashboard.widgetEditor.editTitle", { name: widget.name })}
            onClick={edit}
          />
        </div>
      </div>
    </ItemActions>
  );
});
