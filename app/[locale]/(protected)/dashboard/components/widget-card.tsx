"use client";

import type { WidgetDto } from "@/features/widget/widget.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { openWidgetEditor } from "./widget-interaction";

import { runUserAction } from "@/core/errors/report-application-error";
import { useRootStore } from "@/core/stores/root-store.provider";
import { isRecordActivityWidget, isRecordWidget } from "@/features/widget/widget.schema";
import { RecordActivityWidgetCard } from "./record-activity-widget-card";
import { RecordWidgetCard } from "./record-widget-card";

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
