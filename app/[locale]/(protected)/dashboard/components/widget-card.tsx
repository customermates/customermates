"use client";

import type { WidgetDto } from "@/features/widget/widget.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { ActivityWidgetCard } from "./activity-widget-card";
import { ChartWidgetCard } from "./chart-widget-card";
import { openWidgetEditor } from "./widget-interaction";

import { RecordWidgetCard } from "./record-widget-card";
import { RecordActivityWidgetCard } from "./record-activity-widget-card";
import { isChartWidget, isRecordWidget, isRecordActivityWidget } from "@/features/widget/widget.schema";
import { useRootStore } from "@/core/stores/root-store.provider";
import { runUserAction } from "@/core/errors/report-application-error";

type Props = {
  widget: WidgetDto;
};

export const WidgetCard = observer(({ widget }: Props) => {
  const t = useTranslations();
  const { widgetModalStore } = useRootStore();
  const card = isRecordActivityWidget(widget) ? (
    <RecordActivityWidgetCard widget={widget} />
  ) : isRecordWidget(widget) ? (
    <RecordWidgetCard widget={widget} />
  ) : isChartWidget(widget) ? (
    <ChartWidgetCard widget={widget} />
  ) : (
    <ActivityWidgetCard widget={widget} />
  );

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
