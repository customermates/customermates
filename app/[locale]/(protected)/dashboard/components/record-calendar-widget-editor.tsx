"use client";

import type { ReactNode } from "react";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { CalendarWidgetQuery, CalendarWidgetWindow } from "@/features/widget/record-calendar-widget.schema";
import type { WidgetModalStore } from "./widget-modal.store";

import { toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { notifyIfWorkspaceChanged } from "@/core/errors/workspace-changed-notice";
import { cn } from "@/core/utils/cn";
import { CALENDAR_WIDGET_MAX_DAYS, CalendarWidgetQuerySchema } from "@/features/widget/record-calendar-widget.schema";

import { previewCalendarWidgetAction } from "../actions";
import { calendarDateFieldsOf, widgetNumberFieldsOf } from "./calendar-map-widget-fields";
import { RecordCalendarWidgetCard } from "./record-calendar-widget-card";
import { isRecordCalendarWidgetForm } from "./record-widget-form";
import { CalendarWidgetSkeleton } from "./dashboard-page-skeleton";
import {
  WidgetEditorColumns,
  WidgetEditorSegments,
  WidgetModelStatus,
  WidgetPreviewError,
  WidgetPreviewPlaceholder,
  WidgetSourceFilters,
  WidgetSourcePicker,
  initialWidgetEditorSegment,
  useWidgetAutoPreview,
} from "./widget-editor-layout";
import { WidgetPreviewFrame } from "./widget-preview-frame";

const NONE = "none";
const DAY_CHOICES = [7, 14, 30, 60, CALENDAR_WIDGET_MAX_DAYS];

async function loadPreviewWindow(query: CalendarWidgetQuery, window: CalendarWidgetWindow) {
  const result = await previewCalendarWidgetAction(query, window);
  if (!result.ok) {
    notifyIfWorkspaceChanged(result);
    throw new Error("Calendar preview window unavailable");
  }
  return result.data;
}

export const RecordCalendarWidgetEditor = observer(
  ({
    store,
    section,
    appearance,
    settingsHeader,
  }: {
    store: WidgetModalStore;
    settingsHeader?: ReactNode;
    appearance?: ReactNode | ((model: RecordModelView | null | undefined) => ReactNode);
    section: "data" | "preview" | "all";
  }) => {
    const t = useTranslations();
    const model = store.recordModel;
    const form = store.form;
    const preview = store.calendarPreview;
    const loading = store.recordPreviewLoading;
    const previewError = store.recordPreviewFailed;
    const previewKey = store.recordQueryKey;
    const query = isRecordCalendarWidgetForm(form) ? form.calendarQuery : null;
    const queryValid = query ? CalendarWidgetQuerySchema.safeParse(query).success : false;
    useWidgetAutoPreview(store, (section === "preview" || section === "all") && queryValid, store.runCalendarPreview);
    if (!query || !isRecordCalendarWidgetForm(form)) return null;
    const typeId = query.source.typeId;
    const sourceType = model?.types.find((type) => type.id === typeId);
    const dateFields = calendarDateFieldsOf(model, typeId);
    const numberFields = widgetNumberFieldsOf(model, typeId);
    const upcoming = query.layout === "upcoming";
    const shownPreview = preview && preview.data.schemaRevision === model?.revision ? preview : null;
    const previewedQuery = shownPreview ? (JSON.parse(shownPreview.key) as CalendarWidgetQuery) : null;
    const previewContent = (
      <div className="min-w-0 space-y-3">
        <WidgetPreviewFrame
          interactive
          error={previewError && !loading ? <WidgetPreviewError onRetry={store.runCalendarPreview} /> : null}
          geometry={store.previewGeometry}
          kind={form.kind}
          loading={loading || (model === undefined && !shownPreview)}
        >
          {shownPreview && previewedQuery ? (
            <div
              className={cn("h-full transition-opacity", shownPreview.key !== previewKey && "opacity-50")}
              data-preview-current={shownPreview.key === previewKey}
            >
              <RecordCalendarWidgetCard
                calendarQuery={previewedQuery}
                data={shownPreview.data}
                displayOptions={toJS(form.displayOptions)}
                fields={shownPreview.fields}
                listLabels={model?.types.find((type) => type.id === previewedQuery.source.typeId)}
                loadWindow={(window) => loadPreviewWindow(previewedQuery, window)}
                name={form.name.trim() || t("Dashboard.widgetEditor.preview.untitled")}
                status="ready"
              />
            </div>
          ) : (
            <WidgetPreviewPlaceholder incomplete={!queryValid && Boolean(model)}>
              <CalendarWidgetSkeleton animated={false} layout={query.layout} />
            </WidgetPreviewPlaceholder>
          )}
        </WidgetPreviewFrame>
      </div>
    );
    const amountSelect = (
      <FormSelect
        disabled={!model}
        id="calendarQuery.amountFieldId"
        items={[
          { value: NONE, label: t("Common.none") },
          ...numberFields.map((field) => ({ value: field.id, label: field.label })),
        ]}
        label={upcoming ? t("RecordCalendarWidgets.amountColumn") : t("RecordWidgets.value")}
        required={!upcoming && query.aggregation === "sum"}
        value={query.amountFieldId ?? NONE}
        onValueChange={(value) => {
          store.onChange("calendarQuery.amountFieldId", value === NONE ? null : value);
          if (value === NONE) store.onChange("calendarQuery.aggregation", "count");
        }}
      />
    );
    const dataContent = (
      <div className="space-y-4">
        <WidgetSourcePicker id="calendarQuery.source.typeId" model={model} typeId={typeId} />

        <WidgetModelStatus store={store} />

        {store.calendarDateFieldMissing && (
          <p className="text-xs text-muted-foreground" data-widget-field-requirement="date">
            {t("RecordCalendarWidgets.noDateField", { list: sourceType?.pluralLabel ?? "" })}
          </p>
        )}

        <FormSelect
          required
          disabled={!model || dateFields.length === 0}
          id="calendarQuery.dateFieldId"
          items={dateFields.map((field) => ({ value: field.id, label: field.label }))}
          label={t("RecordCalendarWidgets.dateField")}
        />

        <FormSelect
          id="calendarQuery.layout"
          items={[
            { value: "upcoming", label: t("RecordCalendarWidgets.layouts.upcoming") },
            { value: "month", label: t("RecordCalendarWidgets.layouts.month") },
          ]}
          label={t("RecordCalendarWidgets.layout")}
        />

        {upcoming ? (
          <>
            <FormSelect
              id="calendarQuery.days"
              items={[...new Set([...DAY_CHOICES, query.days])]
                .sort((left, right) => left - right)
                .map((days) => ({ value: String(days), label: t("RecordCalendarWidgets.dayCount", { count: days }) }))}
              label={t("RecordCalendarWidgets.days")}
              value={String(query.days)}
              onValueChange={(value) => store.onChange("calendarQuery.days", Number(value))}
            />

            <div className="space-y-1.5">
              <FormSwitch id="calendarQuery.showOverdue" label={t("RecordCalendarWidgets.showOverdue")} />

              <p className="text-xs text-muted-foreground">{t("RecordCalendarWidgets.showOverdueHelp")}</p>
            </div>

            {amountSelect}
          </>
        ) : (
          <>
            <FormSelect
              id="calendarQuery.aggregation"
              items={[
                { value: "count", label: t("RecordModel.reducers.count") },
                { value: "sum", label: t("RecordModel.reducers.sum"), disabled: numberFields.length === 0 },
              ]}
              label={t("RecordWidgets.measure")}
              onValueChange={(value) => {
                store.onChange("calendarQuery.aggregation", value);
                if (value === "sum" && !query.amountFieldId)
                  store.onChange("calendarQuery.amountFieldId", numberFields[0]?.id ?? null);
              }}
            />

            {amountSelect}
          </>
        )}
      </div>
    );
    if (section === "data") return dataContent;
    if (section === "preview") return previewContent;
    return (
      <WidgetEditorColumns
        preview={<section id="widget-config-preview">{previewContent}</section>}
        settings={
          <WidgetEditorSegments
            appearance={typeof appearance === "function" ? appearance(model) : appearance}
            appearanceFields={["displayOptions", "isTemplate"]}
            data={
              <>
                {settingsHeader}

                {dataContent}

                <WidgetSourceFilters id="calendarQuery.source" source={query.source} store={store} typeId={typeId} />
              </>
            }
            dataFields={[
              "name",
              "calendarQuery.source.typeId",
              "calendarQuery.dateFieldId",
              "calendarQuery.layout",
              "calendarQuery.days",
              "calendarQuery.amountFieldId",
              "calendarQuery.aggregation",
              "calendarQuery.source.filters",
              "calendarQuery.source.relatedFilters",
            ]}
            initial={initialWidgetEditorSegment(store.expandedSection)}
          />
        }
      />
    );
  },
);
