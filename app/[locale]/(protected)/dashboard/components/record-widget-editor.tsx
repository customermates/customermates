"use client";

import { useEffect, type ReactNode } from "react";
import { RecordQueryFilters } from "@/components/records/record-query-filters";
import { toJS } from "mobx";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { omit } from "lodash";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { WidgetModalStore } from "./widget-modal.store";
import {
  RECORD_MEASURE_DATE_INTERVALS,
  RECORD_MEASURE_DEFAULT_GROUP_LIMIT,
  RECORD_MEASURE_MAX_GROUP_LIMIT,
  RecordMeasureSchema,
} from "@/features/records/record-measure.schema";
import { widgetDisplayTypeIssue } from "@/features/widget/widget-display-rules";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { FormSelect } from "@/components/forms/form-select";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { discoverWidgetRecordTypesAction } from "../actions";
import { isRecordWidgetForm } from "./record-widget-form";
import { browserTimeZone } from "./widget-time-zone";
import { RecordWidgetCard } from "./record-widget-card";
import {
  WidgetEditorColumns,
  WidgetEditorSegments,
  WidgetPreviewSkeleton,
  initialWidgetEditorSegment,
  opensWidgetFilters,
} from "./widget-editor-layout";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { WidgetPreviewFrame } from "./widget-preview-frame";
import { cn } from "@/core/utils/cn";
import { widgetRelationshipChoices } from "./record-widget-filters";
import { isRecordMeasureGroupField } from "@/features/records/record-measure-validation";

const AUTO_PREVIEW_DELAY_MS = 600;

export const RecordWidgetEditor = observer(
  ({
    store,
    section,
    appearance,
    settingsHeader,
  }: {
    store: WidgetModalStore;
    settingsHeader?: ReactNode;
    appearance?: ReactNode | ((model: RecordModelView | null | undefined) => ReactNode);
    section: "data" | "filters" | "preview" | "all";
  }) => {
    const t = useTranslations();
    const model = store.recordModel;
    const retry = () => runUserAction(store.loadRecordModel);
    const form = store.form;
    const preview = store.recordPreview;
    const loading = store.recordPreviewLoading;
    const previewError = store.recordPreviewFailed;
    const previewKey = store.recordMeasureKey;
    const autoPreviewKey =
      (section === "preview" || section === "all") &&
      previewKey &&
      model &&
      store.isOpen &&
      isRecordWidgetForm(form) &&
      RecordMeasureSchema.safeParse(form.measure).success
        ? `${model.revision}:${previewKey}`
        : null;
    const debouncedAutoPreviewKey = useDebouncedValue(autoPreviewKey, AUTO_PREVIEW_DELAY_MS);
    useEffect(() => {
      if (!debouncedAutoPreviewKey || debouncedAutoPreviewKey !== autoPreviewKey) return;
      runUserAction(store.runRecordPreview);
    }, [debouncedAutoPreviewKey, autoPreviewKey, form, store]);
    const displayIssue =
      model && isRecordWidgetForm(form)
        ? widgetDisplayTypeIssue(form.displayOptions.displayType, form.measure, model)
        : null;
    if (!isRecordWidgetForm(form)) return null;
    const measure = form.measure;
    const key = JSON.stringify(measure);
    const sourceFields =
      model?.fields.filter((field) => field.typeId === measure.source.typeId && !field.archived) ?? [];
    let groupTypeId = measure.source.typeId;
    for (const step of measure.groupBy?.path ?? []) {
      const relation = model?.relationships.find((relation) => relation.id === step.relationId);
      if (relation) groupTypeId = step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
    }
    const groupFields =
      model?.fields.filter((field) => field.typeId === groupTypeId && isRecordMeasureGroupField(field)) ?? [];
    const temporalGroup =
      measure.groupBy?.fieldId === "system:createdAt" ||
      measure.groupBy?.fieldId === "system:updatedAt" ||
      groupFields.some(
        (field) => field.id === measure.groupBy?.fieldId && ["date", "dateTime"].includes(field.valueType),
      );
    const status =
      model === undefined ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("RecordWidgets.loadingSchema")}
        </p>
      ) : model === null ? (
        <Button type="button" variant="secondary" onClick={retry}>
          {t("ErrorCard.retry")}
        </Button>
      ) : null;
    const measureValid = RecordMeasureSchema.safeParse(measure).success;
    const shownPreview = preview && preview.result.schemaRevision === model?.revision ? preview : null;
    const previewContent = (
      <div className="min-w-0 space-y-3">
        <WidgetPreviewFrame
          error={
            previewError && !loading ? (
              <>
                <p className="text-center text-sm text-destructive" role="alert">
                  {t("RecordWidgets.previewFailed")}
                </p>

                <Button type="button" variant="secondary" onClick={() => runUserAction(store.runRecordPreview)}>
                  {t("ErrorCard.retry")}
                </Button>
              </>
            ) : null
          }
          geometry={store.previewGeometry}
          kind={form.kind}
          loading={loading || (model === undefined && !shownPreview)}
        >
          {shownPreview ? (
            <div
              className={cn("h-full transition-opacity", preview?.key !== key && "opacity-50")}
              data-preview-current={preview?.key === key}
            >
              <RecordWidgetCard
                data={shownPreview.result}
                decimalPlaces={shownPreview.decimalPlaces}
                displayOptions={toJS(form.displayOptions)}
                groupOptions={shownPreview.groupOptions}
                listLabels={model?.types.find((type) => type.id === measure.source.typeId)}
                measure={measure}
                name={form.name.trim() || t("Dashboard.widgetEditor.preview.untitled")}
                status="ready"
              />
            </div>
          ) : (
            <div className="flex h-full flex-col justify-center rounded-xl border border-dashed border-border p-6">
              {!measureValid && model ? (
                <p className="text-center text-sm text-muted-foreground">
                  {t("Dashboard.widgetEditor.preview.incomplete")}
                </p>
              ) : (
                <WidgetPreviewSkeleton />
              )}
            </div>
          )}
        </WidgetPreviewFrame>
      </div>
    );
    const groupSummary = measure.groupBy
      ? measure.groupBy.fieldId
        ? (groupFields.find((field) => field.id === measure.groupBy?.fieldId)?.label ??
          {
            "system:assignedTo": t("RecordModel.assignedTo"),
            "system:createdAt": t("RecordModel.createdAt"),
            "system:updatedAt": t("RecordModel.updatedAt"),
          }[measure.groupBy.fieldId] ??
          null)
        : t("RecordWidgets.groupRecord")
      : t("RecordModel.noGrouping");
    const filterCount =
      measure.source.filters.length +
      measure.source.relationships.length +
      (measure.source.relatedFilters?.length ?? 0);
    const filtersContent = (
      <div className="space-y-4">
        {status}

        <RecordQueryFilters
          anchorId="widget-source-filters"
          id="measure.source"
          model={model}
          typeId={measure.source.typeId}
        />
      </div>
    );
    const sourceType = model?.types.find((type) => type.id === measure.source.typeId);
    const relations = widgetRelationshipChoices(model, groupTypeId);
    const dataContent = (
      <div className="space-y-4">
        <FormAutocomplete<{ id: string; pluralLabel: string }>
          getItems={discoverWidgetRecordTypesAction}
          id="measure.source.typeId"
          items={sourceType ? [{ id: sourceType.id, pluralLabel: sourceType.pluralLabel }] : []}
          label={t("RecordWidgets.source")}
          renderValue={(items) => items.map((item) => item.data?.pluralLabel ?? t("Loading.text")).join(", ")}
        >
          {(type) => <FormAutocompleteItem textValue={type.pluralLabel}>{type.pluralLabel}</FormAutocompleteItem>}
        </FormAutocomplete>

        {status}

        <FormSelect
          id="measure.aggregation"
          items={RecordMeasureSchema.shape.aggregation.options.map((value) => ({
            value,
            label: t(`RecordModel.reducers.${value}`),
          }))}
          label={t("RecordWidgets.measure")}
          onValueChange={(value) => {
            store.onChange("measure.aggregation", value);
            store.onChange(
              "measure.valueFieldId",
              value === "count"
                ? null
                : (measure.valueFieldId ??
                    sourceFields.find((field) => ["number", "currency"].includes(field.valueType))?.id ??
                    null),
            );
          }}
        />

        {measure.aggregation !== "count" && (
          <FormSelect
            required
            id="measure.valueFieldId"
            items={sourceFields
              .filter((field) => ["number", "currency"].includes(field.valueType))
              .map((field) => ({ value: field.id, label: field.label }))}
            label={t("RecordWidgets.value")}
          />
        )}
      </div>
    );
    const groupingContent = (
      <div className="space-y-4">
        {displayIssue && (
          <p className="text-xs text-muted-foreground" data-widget-display-requirement={displayIssue}>
            {t(`Dashboard.displayTypeRequirements.${displayIssue}`)}
          </p>
        )}

        {(measure.groupBy?.path ?? []).map((step, index) => {
          const relation = model?.relationships.find((relation) => relation.id === step.relationId);
          const label = (step.direction === "outgoing" ? relation?.sourceLabel : relation?.targetLabel) ?? "";
          return (
            <div key={`${step.relationId}:${index}`} className="flex items-center justify-between gap-2 text-sm">
              <span>{label}</span>

              <Button
                aria-label={t("RecordModel.removePathStep", { label })}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() =>
                  store.onChange("measure.groupBy", {
                    path: measure.groupBy?.path.slice(0, index) ?? [],
                    fieldId: null,
                  })
                }
              >
                <X className="size-4" />
              </Button>
            </div>
          );
        })}

        <FormSelect
          disabled={!model || (measure.groupBy?.path.length ?? 0) >= 6}
          id="widget-group-path"
          items={relations}
          label={t("RecordWidgets.groupPath")}
          value=""
          onValueChange={(next) => {
            const [relationId, direction] = next.split(":");
            store.onChange("measure.groupBy", {
              path: [...(measure.groupBy?.path ?? []), { relationId, direction }],
              fieldId: null,
            });
          }}
        />

        <FormSelect
          id="widget-group-field"
          items={[
            { value: "none", label: t("RecordModel.noGrouping") },
            { value: "record", label: t("RecordWidgets.groupRecord") },
            ...groupFields.map((field) => ({ value: field.id, label: field.label })),
            { value: "system:assignedTo", label: t("RecordModel.assignedTo") },
            { value: "system:createdAt", label: t("RecordModel.createdAt") },
            { value: "system:updatedAt", label: t("RecordModel.updatedAt") },
          ]}
          label={t("RecordWidgets.group")}
          value={measure.groupBy ? (measure.groupBy.fieldId ?? "record") : "none"}
          onValueChange={(value) => {
            store.onChange(
              "measure.groupBy",
              value === "none"
                ? null
                : {
                    path: measure.groupBy?.path ?? [],
                    fieldId: value === "record" ? null : value,
                    ...(measure.groupBy?.filter ? { filter: measure.groupBy.filter } : {}),
                  },
            );
            if (measure.groupLimit === RECORD_MEASURE_MAX_GROUP_LIMIT)
              store.onChange("measure.groupLimit", RECORD_MEASURE_DEFAULT_GROUP_LIMIT);
          }}
        />

        {measure.groupBy && temporalGroup && (
          <FormSelect
            id="widget-group-interval"
            items={[
              { value: "none", label: t("RecordWidgets.intervals.none") },
              ...RECORD_MEASURE_DATE_INTERVALS.map((interval) => ({
                value: interval,
                label: t(`RecordWidgets.intervals.${interval}`),
              })),
            ]}
            label={t("RecordWidgets.interval")}
            value={measure.groupBy.dateInterval ?? "none"}
            onValueChange={(value) => {
              const grouping = omit(measure.groupBy, ["dateInterval", "timeZone"]);
              const interval = RECORD_MEASURE_DATE_INTERVALS.find((candidate) => candidate === value);
              store.onChange(
                "measure.groupBy",
                interval ? { ...grouping, dateInterval: interval, timeZone: browserTimeZone() } : grouping,
              );
              store.onChange(
                "measure.groupLimit",
                interval ? RECORD_MEASURE_MAX_GROUP_LIMIT : RECORD_MEASURE_DEFAULT_GROUP_LIMIT,
              );
            }}
          />
        )}

        {measure.groupBy && (
          <section aria-label={t("RecordWidgets.groupFilters")} className="space-y-3">
            <p className="text-xs text-muted-foreground">{t("RecordWidgets.groupFilterHelp")}</p>

            <RecordQueryFilters
              anchorId="widget-group-filters"
              id="measure.groupBy.filter"
              model={model}
              typeId={groupTypeId}
            />
          </section>
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
                  summary={t("Dashboard.widgetEditor.sections.activeFilters", { count: filterCount })}
                  title={t("Dashboard.widgetEditor.sections.filters")}
                >
                  {filtersContent}
                </CollapsibleSection>

                <CollapsibleSection
                  defaultOpen
                  id="widget-config-grouping"
                  summary={groupSummary}
                  title={t("Dashboard.widgetEditor.sections.grouping")}
                >
                  {groupingContent}
                </CollapsibleSection>
              </>
            }
            dataFields={[
              "name",
              "measure.source.typeId",
              "measure.aggregation",
              "measure.valueFieldId",
              "measure.source.filters",
              "measure.source.relatedFilters",
              "measure.groupBy",
            ]}
            initial={initialWidgetEditorSegment(store.expandedSection)}
          />
        }
      />
    );
  },
);
