"use client";

import type { ReactNode } from "react";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { MapWidgetQuery } from "@/features/widget/record-map-widget.schema";
import type { WidgetModalStore } from "./widget-modal.store";

import { toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { FormSelect } from "@/components/forms/form-select";
import { cn } from "@/core/utils/cn";
import { MapWidgetQuerySchema } from "@/features/widget/record-map-widget.schema";

import {
  mapAddressFieldsOf,
  mapDetailFieldsOf,
  widgetColorFieldsOf,
  widgetNumberFieldsOf,
} from "./calendar-map-widget-fields";
import { MapWidgetSkeleton } from "./dashboard-page-skeleton";
import { RecordMapWidgetCard } from "./record-map-widget-card";
import { isRecordMapWidgetForm } from "./record-widget-form";
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

type OptionalField = "colorFieldId" | "sizeFieldId" | "detailFieldId";

export const RecordMapWidgetEditor = observer(
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
    const preview = store.mapPreview;
    const loading = store.recordPreviewLoading;
    const previewError = store.recordPreviewFailed;
    const previewKey = store.recordQueryKey;
    const query = isRecordMapWidgetForm(form) ? form.mapQuery : null;
    const queryValid = query ? MapWidgetQuerySchema.safeParse(query).success : false;
    useWidgetAutoPreview(store, (section === "preview" || section === "all") && queryValid, store.runMapPreview);
    if (!query || !isRecordMapWidgetForm(form)) return null;
    const typeId = query.source.typeId;
    const sourceType = model?.types.find((type) => type.id === typeId);
    const addressFields = mapAddressFieldsOf(model, typeId);
    const shownPreview = preview && preview.data.schemaRevision === model?.revision ? preview : null;
    const previewedQuery = shownPreview ? (JSON.parse(shownPreview.key) as MapWidgetQuery) : null;
    const optionalSelect = (key: OptionalField, label: string, fields: Array<{ id: string; label: string }>) => (
      <FormSelect
        disabled={!model}
        id={`mapQuery.${key}`}
        items={[
          { value: NONE, label: t("Common.none") },
          ...fields.map((field) => ({ value: field.id, label: field.label })),
        ]}
        label={label}
        value={query[key] ?? NONE}
        onValueChange={(value) => store.onChange(`mapQuery.${key}`, value === NONE ? null : value)}
      />
    );
    const previewContent = (
      <div className="min-w-0 space-y-3">
        <WidgetPreviewFrame
          interactive
          error={previewError && !loading ? <WidgetPreviewError onRetry={store.runMapPreview} /> : null}
          geometry={store.previewGeometry}
          kind={form.kind}
          loading={loading || (model === undefined && !shownPreview)}
        >
          {shownPreview && previewedQuery ? (
            <div
              className={cn("h-full transition-opacity", shownPreview.key !== previewKey && "opacity-50")}
              data-preview-current={shownPreview.key === previewKey}
            >
              <RecordMapWidgetCard
                data={shownPreview.data}
                displayOptions={toJS(form.displayOptions)}
                fields={shownPreview.fields}
                listLabels={model?.types.find((type) => type.id === previewedQuery.source.typeId)}
                mapQuery={previewedQuery}
                name={form.name.trim() || t("Dashboard.widgetEditor.preview.untitled")}
                status="ready"
              />
            </div>
          ) : (
            <WidgetPreviewPlaceholder incomplete={!queryValid && Boolean(model)}>
              <MapWidgetSkeleton animated={false} />
            </WidgetPreviewPlaceholder>
          )}
        </WidgetPreviewFrame>
      </div>
    );
    const dataContent = (
      <div className="space-y-4">
        <WidgetSourcePicker id="mapQuery.source.typeId" model={model} typeId={typeId} />

        <WidgetModelStatus store={store} />

        {store.mapAddressFieldMissing && (
          <p className="text-xs text-muted-foreground" data-widget-field-requirement="address">
            {t("RecordMapWidgets.noAddressField", { list: sourceType?.pluralLabel ?? "" })}
          </p>
        )}

        <FormSelect
          required
          disabled={!model || addressFields.length === 0}
          id="mapQuery.addressFieldId"
          items={addressFields.map((field) => ({ value: field.id, label: field.label }))}
          label={t("RecordMapWidgets.addressField")}
        />

        {optionalSelect("colorFieldId", t("RecordMapWidgets.colorBy"), widgetColorFieldsOf(model, typeId))}

        {optionalSelect("sizeFieldId", t("RecordMapWidgets.sizeBy"), widgetNumberFieldsOf(model, typeId))}

        {optionalSelect(
          "detailFieldId",
          t("RecordMapWidgets.detailField"),
          mapDetailFieldsOf(model, typeId).filter((field) => field.id !== query.addressFieldId),
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

                <WidgetSourceFilters id="mapQuery.source" source={query.source} store={store} typeId={typeId} />
              </>
            }
            dataFields={[
              "name",
              "mapQuery.source.typeId",
              "mapQuery.addressFieldId",
              "mapQuery.colorFieldId",
              "mapQuery.sizeFieldId",
              "mapQuery.detailFieldId",
              "mapQuery.source.filters",
              "mapQuery.source.relatedFilters",
            ]}
            initial={initialWidgetEditorSegment(store.expandedSection)}
          />
        }
      />
    );
  },
);
