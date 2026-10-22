"use client";

import type { ReactNode } from "react";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { WidgetModalStore } from "./widget-modal.store";

import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { useAppForm } from "@/components/forms/form-context";
import { RecordQueryFilters } from "@/components/records/record-query-filters";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { SegmentedControl, SegmentedControlPanel } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { runUserAction } from "@/core/errors/report-application-error";
import { actionData } from "@/core/utils/action-data";
import { cn } from "@/core/utils/cn";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";

import { discoverWidgetRecordTypesAction } from "../actions";
import { widgetSourceFilterCount } from "./widget-source-summary";

type WidgetEditorSegment = "data" | "appearance";

const AUTO_PREVIEW_DELAY_MS = 600;

export const WIDGET_EDITOR_STACK_CLASS = "flex min-w-0 flex-col gap-6";

export function WidgetEditorColumns({ preview, settings }: { preview: ReactNode; settings: ReactNode }) {
  return (
    <div className={WIDGET_EDITOR_STACK_CLASS} data-widget-editor="stacked">
      <div className="min-w-0" data-slot="widget-editor-preview">
        {preview}
      </div>

      <div className="flex min-w-0 flex-col" data-slot="widget-editor-settings">
        {settings}
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
          <Skeleton key={height} className={cn(height, "flex-1 rounded-md")} />
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
  return ["filters", "activityFilters"].includes(section);
}

export function useWidgetAutoPreview(store: WidgetModalStore, enabled: boolean, run: () => Promise<void>) {
  const model = store.recordModel;
  const previewKey = store.recordQueryKey;
  const form = store.form;
  const autoPreviewKey = enabled && previewKey && model && store.isOpen ? `${model.revision}:${previewKey}` : null;
  const debouncedAutoPreviewKey = useDebouncedValue(autoPreviewKey, AUTO_PREVIEW_DELAY_MS);
  useEffect(() => {
    if (!debouncedAutoPreviewKey || debouncedAutoPreviewKey !== autoPreviewKey) return;
    runUserAction(run);
  }, [debouncedAutoPreviewKey, autoPreviewKey, form, run]);
}

export const WidgetModelStatus = observer(function WidgetModelStatus({ store }: { store: WidgetModalStore }) {
  const t = useTranslations();
  if (store.recordModel === undefined) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {t("RecordWidgets.loadingSchema")}
      </p>
    );
  }
  if (store.recordModel === null) {
    return (
      <Button type="button" variant="secondary" onClick={() => runUserAction(store.loadRecordModel)}>
        {t("ErrorCard.retry")}
      </Button>
    );
  }
  return null;
});

export function WidgetPreviewError({ onRetry }: { onRetry: () => Promise<void> }) {
  const t = useTranslations();
  return (
    <>
      <p className="text-center text-sm text-destructive" role="alert">
        {t("RecordWidgets.previewFailed")}
      </p>

      <Button type="button" variant="secondary" onClick={() => runUserAction(onRetry)}>
        {t("ErrorCard.retry")}
      </Button>
    </>
  );
}

export function WidgetPreviewPlaceholder({ incomplete, children }: { incomplete: boolean; children: ReactNode }) {
  const t = useTranslations();
  return (
    <div className="flex h-full flex-col justify-center rounded-xl border border-dashed border-border p-6">
      {incomplete ? (
        <p className="text-center text-sm text-muted-foreground">{t("Dashboard.widgetEditor.preview.incomplete")}</p>
      ) : (
        children
      )}
    </div>
  );
}

export function WidgetSourcePicker({
  id,
  model,
  typeId,
}: {
  id: string;
  model: RecordModelView | null | undefined;
  typeId: string;
}) {
  const t = useTranslations();
  const sourceType = model?.types.find((type) => type.id === typeId);
  return (
    <FormAutocomplete<{ id: string; pluralLabel: string }>
      getItems={(params) => actionData(discoverWidgetRecordTypesAction(params))}
      id={id}
      items={sourceType ? [{ id: sourceType.id, pluralLabel: sourceType.pluralLabel }] : []}
      label={t("RecordWidgets.source")}
      renderValue={(items) => items.map((item) => item.data?.pluralLabel ?? t("Loading.text")).join(", ")}
    >
      {(type) => <FormAutocompleteItem textValue={type.pluralLabel}>{type.pluralLabel}</FormAutocompleteItem>}
    </FormAutocomplete>
  );
}

export const WidgetSourceFilters = observer(function WidgetSourceFilters({
  store,
  id,
  source,
  typeId,
  open,
  onOpenChange,
}: {
  store: WidgetModalStore;
  id: string;
  source: Parameters<typeof widgetSourceFilterCount>[0];
  typeId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const t = useTranslations();
  return (
    <CollapsibleSection
      defaultOpen={opensWidgetFilters(store.expandedSection)}
      id="widget-config-filters"
      open={open}
      summary={t("Dashboard.widgetEditor.sections.activeFilters", { count: widgetSourceFilterCount(source) })}
      title={t("Dashboard.widgetEditor.sections.filters")}
      onOpenChange={onOpenChange}
    >
      <div className="space-y-4">
        <WidgetModelStatus store={store} />

        <RecordQueryFilters inline anchorId="widget-source-filters" id={id} model={store.recordModel} typeId={typeId} />
      </div>
    </CollapsibleSection>
  );
});
