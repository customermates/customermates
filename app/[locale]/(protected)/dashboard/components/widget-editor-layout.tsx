import type { ReactNode } from "react";

import { useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { useAppForm } from "@/components/forms/form-context";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";

type WidgetEditorSegment = "data" | "appearance";

export const WIDGET_EDITOR_GRID_CLASS =
  "grid min-w-0 gap-6 lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)] lg:items-start xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]";

export function WidgetEditorColumns({ preview, settings }: { preview: ReactNode; settings: ReactNode }) {
  return (
    <div className={WIDGET_EDITOR_GRID_CLASS} data-widget-editor="split">
      <div className="flex min-w-0 flex-col" data-slot="widget-editor-settings">
        {settings}
      </div>

      <div className="min-w-0 lg:sticky lg:top-0" data-slot="widget-editor-preview">
        {preview}
      </div>
    </div>
  );
}

export function WidgetPreviewSkeleton() {
  return (
    <div aria-hidden className="flex h-full min-h-0 flex-col gap-3">
      <Skeleton className="h-3 w-28" />

      <div className="flex min-h-0 flex-1 items-end gap-3">
        {["h-2/5", "h-4/5", "h-3/5", "h-full", "h-1/2"].map((height) => (
          <Skeleton key={height} className={`${height} flex-1 rounded-md`} />
        ))}
      </div>
    </div>
  );
}

export const WidgetEditorSegments = observer(function WidgetEditorSegments({
  data,
  appearance,
  dataFields,
  appearanceFields,
  initial,
}: {
  data: ReactNode;
  appearance: ReactNode;
  dataFields: readonly string[];
  appearanceFields: readonly string[];
  initial: WidgetEditorSegment;
}) {
  const t = useTranslations();
  const form = useAppForm();
  const [segment, setSegment] = useState<WidgetEditorSegment>(initial);
  const invalid = (fields: readonly string[]) =>
    fields.some((field) => {
      const errors = form?.getError(field);
      return Array.isArray(errors) ? errors.length > 0 : Boolean(errors);
    });
  return (
    <SegmentedControl
      className="gap-4"
      idPrefix="widget-editor"
      items={[
        {
          value: "data",
          label: t("Dashboard.widgetEditor.tabs.data"),
          invalid: invalid(dataFields),
          invalidLabel: t("EditorTabs.invalid"),
        },
        {
          value: "appearance",
          label: t("Dashboard.widgetEditor.tabs.appearance"),
          invalid: invalid(appearanceFields),
          invalidLabel: t("EditorTabs.invalid"),
        },
      ]}
      label={t("Dashboard.widgetEditor.settings")}
      value={segment}
      onValueChange={setSegment}
    >
      <SegmentedControlPanel className="m-0 space-y-4" value="data">
        {data}
      </SegmentedControlPanel>

      <SegmentedControlPanel className="m-0 space-y-4" value="appearance">
        {appearance}
      </SegmentedControlPanel>
    </SegmentedControl>
  );
});

export function initialWidgetEditorSegment(section: string): WidgetEditorSegment {
  return section === "display" ? "appearance" : "data";
}

export function opensWidgetFilters(section: string) {
  return ["filters", "dealFilters", "activityFilters"].includes(section);
}
