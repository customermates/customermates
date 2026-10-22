"use client";

import type { ReactNode } from "react";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { MapWidgetQuery } from "@/features/widget/record-map-widget.schema";
import type { WidgetModalStore } from "./widget-modal.store";

import { useEffect } from "react";
import { toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";

import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { FormSelect } from "@/components/forms/form-select";
import { RecordQueryFilters } from "@/components/records/record-query-filters";
import { Button } from "@/components/ui/button";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { runUserAction } from "@/core/errors/report-application-error";
import { actionData } from "@/core/utils/action-data";
import { cn } from "@/core/utils/cn";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { MapWidgetQuerySchema } from "@/features/widget/record-map-widget.schema";

import { discoverWidgetRecordTypesAction } from "../actions";
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
  initialWidgetEditorSegment,
  opensWidgetFilters,
} from "./widget-editor-layout";
import { WidgetPreviewFrame } from "./widget-preview-frame";
import { widgetSourceFilterCount } from "./widget-source-summary";

const AUTO_PREVIEW_DELAY_MS = 600;
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
    const autoPreviewKey =
      (section === "preview" || section === "all") && previewKey && model && store.isOpen && queryValid
        ? `${model.revision}:${previewKey}`
        : null;
    const debouncedAutoPreviewKey = useDebouncedValue(autoPreviewKey, AUTO_PREVIEW_DELAY_MS);
    useEffect(() => {
      if (!debouncedAutoPreviewKey || debouncedAutoPreviewKey !== autoPreviewKey) return;
      runUserAction(store.runMapPreview);
    }, [debouncedAutoPreviewKey, autoPreviewKey, form, store]);
    if (!query || !isRecordMapWidgetForm(form)) return null;
    const typeId = query.source.typeId;
    const sourceType = model?.types.find((type) => type.id === typeId);
    const addressFields = mapAddressFieldsOf(model, typeId);
    const shownPreview = preview && preview.data.schemaRevision === model?.revision ? preview : null;
    const previewedQuery = shownPreview ? (JSON.parse(shownPreview.key) as MapWidgetQuery) : null;
    const status =
      model === undefined ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("RecordWidgets.loadingSchema")}
        </p>
      ) : model === null ? (
        <Button type="button" variant="secondary" onClick={() => runUserAction(store.loadRecordModel)}>
          {t("ErrorCard.retry")}
        </Button>
      ) : null;
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
          error={
            previewError && !loading ? (
              <>
                <p className="text-center text-sm text-destructive" role="alert">
                  {t("RecordWidgets.previewFailed")}
                </p>

                <Button type="button" variant="secondary" onClick={() => runUserAction(store.runMapPreview)}>
                  {t("ErrorCard.retry")}
                </Button>
              </>
            ) : null
          }
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
            <div className="flex h-full flex-col justify-center rounded-xl border border-dashed border-border p-6">
              {!queryValid && model ? (
                <p className="text-center text-sm text-muted-foreground">
                  {t("Dashboard.widgetEditor.preview.incomplete")}
                </p>
              ) : (
                <MapWidgetSkeleton animated={false} />
              )}
            </div>
          )}
        </WidgetPreviewFrame>
      </div>
    );
    const dataContent = (
      <div className="space-y-4">
        <FormAutocomplete<{ id: string; pluralLabel: string }>
          getItems={(params) => actionData(discoverWidgetRecordTypesAction(params))}
          id="mapQuery.source.typeId"
          items={sourceType ? [{ id: sourceType.id, pluralLabel: sourceType.pluralLabel }] : []}
          label={t("RecordWidgets.source")}
          renderValue={(items) => items.map((item) => item.data?.pluralLabel ?? t("Loading.text")).join(", ")}
        >
          {(type) => <FormAutocompleteItem textValue={type.pluralLabel}>{type.pluralLabel}</FormAutocompleteItem>}
        </FormAutocomplete>

        {status}

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

                <CollapsibleSection
                  defaultOpen={opensWidgetFilters(store.expandedSection)}
                  id="widget-config-filters"
                  summary={t("Dashboard.widgetEditor.sections.activeFilters", {
                    count: widgetSourceFilterCount(query.source),
                  })}
                  title={t("Dashboard.widgetEditor.sections.filters")}
                >
                  <div className="space-y-4">
                    {status}

                    <RecordQueryFilters
                      inline
                      anchorId="widget-source-filters"
                      id="mapQuery.source"
                      model={model}
                      typeId={typeId}
                    />
                  </div>
                </CollapsibleSection>
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
