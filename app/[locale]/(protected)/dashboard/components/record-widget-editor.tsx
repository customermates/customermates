"use client";

import { z } from "zod";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { omit } from "lodash";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { RecordWidgetPreview } from "@/features/widget/record-widget-reader";
import type { WidgetModalStore } from "./widget-modal.store";
import {
  RECORD_MEASURE_DATE_INTERVALS,
  RECORD_MEASURE_DEFAULT_GROUP_LIMIT,
  RECORD_MEASURE_MAX_GROUP_LIMIT,
  RecordMeasureSchema,
} from "@/features/records/record-measure.schema";
import { DisplayType } from "@/features/widget/widget.schema";
import { widgetDisplayTypeIssue } from "@/features/widget/widget-display-rules";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { Button } from "@/components/ui/button";
import { reportApplicationError, runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { getRecordModelAction } from "../../records/actions";
import { discoverWidgetRecordTypesAction, previewRecordWidgetAction } from "../actions";
import { isRecordWidgetForm } from "./record-widget-form";
import { browserTimeZone } from "./widget-time-zone";
import { RecordWidgetCard } from "./record-widget-card";
import { WidgetEditorColumns, WidgetPreviewSkeleton } from "./widget-editor-layout";
import { EditorTabs } from "@/components/editor-tabs/editor-tabs";
import { WidgetPreviewFrame } from "./widget-preview-frame";
import { cn } from "@/core/utils/cn";
import { recordFilterFields } from "@/features/records/record-filter";
import {
  RecordWidgetFieldFilters,
  RecordWidgetRelatedFilters,
  widgetRelationshipChoices,
} from "./record-widget-filters";

const AUTO_PREVIEW_DELAY_MS = 600;

function useWidgetModel(store: WidgetModalStore) {
  const form = store.form;
  const key =
    isRecordWidgetForm(form) && store.isOpen
      ? JSON.stringify([
          form.measure.source.typeId,
          [
            form.measure.groupBy?.path ?? [],
            ...(form.measure.source.relatedFilters ?? []).map((filter) => filter.path),
            ...(form.measure.groupBy?.filter?.relatedFilters ?? []).map((filter) => [
              ...(form.measure.groupBy?.path ?? []),
              ...filter.path,
            ]),
          ],
        ])
      : null;
  const [state, setState] = useState<{ key: string; model: RecordModelView | null } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!key) return;
    let current = true;
    const [sourceTypeId, paths] = JSON.parse(key) as [
      string,
      Array<Array<{ relationId: string; direction: "incoming" | "outgoing" }>>,
    ];
    const load = async () => {
      const ids = [sourceTypeId];
      let model = await getRecordModelAction(ids);
      for (const path of paths) {
        let typeId = sourceTypeId;
        for (const step of path) {
          const relation = model.relationships.find((relation) => relation.id === step.relationId);
          if (!relation || (step.direction === "outgoing" ? relation.sourceTypeId : relation.targetTypeId) !== typeId)
            throw new Error("The selected relationship is unavailable");
          typeId = step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
          if (!ids.includes(typeId)) ids.push(typeId);
          if (!model.types.some((type) => type.id === typeId)) model = await getRecordModelAction(ids);
        }
      }
      if (current) setState({ key, model });
    };
    void load().catch(() => {
      if (current) setState({ key, model: null });
    });
    return () => {
      current = false;
    };
  }, [key, attempt]);
  return { model: state?.key === key ? state.model : undefined, retry: () => setAttempt((value) => value + 1) };
}

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
    const { model, retry } = useWidgetModel(store);
    const form = store.form;
    const [preview, setPreview] = useState<({ key: string } & RecordWidgetPreview) | null>(null);
    const [loading, setLoading] = useState(false);
    const [previewError, setPreviewError] = useState(false);
    const previewGeneration = useRef(0);
    const explicitPreviewKey = useRef<string | null>(null);
    const previewKey = isRecordWidgetForm(form) ? JSON.stringify(form.measure) : null;
    useEffect(() => {
      explicitPreviewKey.current = null;
      previewGeneration.current += 1;
      setLoading(false);
      setPreviewError(false);
      return () => {
        previewGeneration.current += 1;
      };
    }, [form, previewKey, model?.revision, store.isOpen]);
    const runMeasurePreview = async (explicit: boolean) => {
      const current = store.form;
      if (!isRecordWidgetForm(current)) return;
      const previewed = JSON.stringify(current.measure);
      const requestKey = model ? `${model.revision}:${previewed}` : null;
      if (!explicit && requestKey && explicitPreviewKey.current === requestKey) return;
      if (explicit) explicitPreviewKey.current = requestKey;
      const generation = ++previewGeneration.current;
      const isCurrent = () => generation === previewGeneration.current;
      setLoading(true);
      setPreviewError(false);
      try {
        const parsed = RecordMeasureSchema.safeParse(current.measure);
        if (!parsed.success) {
          setPreviewError(true);
          toastZodErrorTree(z.treeifyError(parsed.error));
          return;
        }
        const result = await store.runPreview(() => previewRecordWidgetAction(parsed.data));
        if (!result || !isCurrent()) return;
        if (!result.ok) {
          setPreviewError(true);
          if (explicit) toastZodErrorTree(result.error);
          return;
        }
        if (model && result.data.result.schemaRevision !== model.revision) {
          retry();
          return;
        }
        setPreview({ key: previewed, ...result.data });
        if (explicit || store.hasUnsavedChanges) store.onChange("expectedRevision", result.data.result.schemaRevision);
      } catch (error) {
        if (isCurrent()) {
          setPreviewError(true);
          if (explicit) throw error;
        }
      } finally {
        if (isCurrent()) setLoading(false);
      }
    };
    const autoPreviewKey =
      (section === "preview" || section === "all") &&
      previewKey &&
      model &&
      store.isOpen &&
      RecordMeasureSchema.safeParse(JSON.parse(previewKey)).success
        ? `${model.revision}:${previewKey}`
        : null;
    const debouncedAutoPreviewKey = useDebouncedValue(autoPreviewKey, AUTO_PREVIEW_DELAY_MS);
    const runAutoPreview = useRef(runMeasurePreview);
    useEffect(() => {
      runAutoPreview.current = runMeasurePreview;
    });
    useEffect(() => {
      if (!debouncedAutoPreviewKey || debouncedAutoPreviewKey !== autoPreviewKey) return;
      runAutoPreview.current(false).catch(reportApplicationError);
    }, [debouncedAutoPreviewKey, autoPreviewKey, form]);
    const displayIssue =
      model && isRecordWidgetForm(form)
        ? widgetDisplayTypeIssue(form.displayOptions.displayType, form.measure, model)
        : null;
    useEffect(() => {
      if (displayIssue && store.isOpen && !store.isHydrating)
        store.onChange("displayOptions.displayType", DisplayType.verticalBarChart);
    }, [displayIssue, store, store.isOpen, store.isHydrating]);
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
      model?.fields.filter(
        (field) =>
          field.typeId === groupTypeId &&
          !field.archived &&
          !field.multiple &&
          !["richText", "dateRange", "dateTimeRange"].includes(field.valueType),
      ) ?? [];
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
          geometry={store.previewGeometry}
          kind={form.kind}
          loading={loading || (model === undefined && !shownPreview)}
          refreshDisabled={!model || !measureValid}
          refreshLabel={t("RecordWidgets.preview")}
          onRefresh={() => runUserAction(() => runMeasurePreview(true))}
        >
          {shownPreview ? (
            <div
              className={cn("h-full transition-opacity", preview?.key !== key && "opacity-50")}
              data-preview-current={preview?.key === key}
            >
              <RecordWidgetCard
                data={shownPreview.result}
                displayOptions={form.displayOptions}
                groupOptions={shownPreview.groupOptions}
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

        {previewError && (
          <p className="text-sm text-destructive" role="alert">
            {t("RecordWidgets.previewFailed")}
          </p>
        )}
      </div>
    );
    const filterCount =
      measure.source.filters.length +
      measure.source.relationships.length +
      (measure.source.relatedFilters?.length ?? 0);
    const filtersContent = (
      <div className="space-y-4">
        <h3 className="sr-only" id="widget-entity-filters-heading">
          {t("Dashboard.widgetEditor.tabs.filtersLabel", { count: filterCount })}
        </h3>

        <FormInput id="measure.source.search" label={t("RecordWidgets.search")} />

        {status}

        <RecordWidgetFieldFilters
          disabled={!model}
          fields={recordFilterFields(sourceFields, {
            createdAt: t("RecordModel.createdAt"),
            updatedAt: t("RecordModel.updatedAt"),
            assignedTo: t("RecordModel.assignedTo"),
          })}
          filters={measure.source.filters}
          id="measure.source.filters"
          store={store}
        />

        <RecordWidgetRelatedFilters
          filters={measure.source.relatedFilters ?? []}
          id="measure.source.relatedFilters"
          model={model}
          store={store}
          typeId={measure.source.typeId}
        />

        {measure.groupBy && (
          <section aria-label={t("RecordWidgets.groupFilters")} className="space-y-4 border-t border-border pt-4">
            <h3 className="text-sm font-medium">{t("RecordWidgets.groupFilters")}</h3>

            <p className="text-xs text-muted-foreground">{t("RecordWidgets.groupFilterHelp")}</p>

            <FormInput id="measure.groupBy.filter.search" label={t("RecordWidgets.search")} />

            <RecordWidgetFieldFilters
              disabled={!model}
              fields={recordFilterFields(model?.fields.filter((field) => field.typeId === groupTypeId) ?? [], {
                createdAt: t("RecordModel.createdAt"),
                updatedAt: t("RecordModel.updatedAt"),
                assignedTo: t("RecordModel.assignedTo"),
              })}
              filters={measure.groupBy.filter?.filters ?? []}
              id="measure.groupBy.filter.filters"
              store={store}
            />

            <RecordWidgetRelatedFilters
              filters={measure.groupBy.filter?.relatedFilters ?? []}
              id="measure.groupBy.filter.relatedFilters"
              model={model}
              store={store}
              typeId={groupTypeId}
            />
          </section>
        )}
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

        {(measure.groupBy?.path ?? []).map((step, index) => {
          const relation = model?.relationships.find((relation) => relation.id === step.relationId);
          return (
            <div key={`${step.relationId}:${index}`} className="flex items-center justify-between gap-2 text-sm">
              <span>{step.direction === "outgoing" ? relation?.sourceLabel : relation?.targetLabel}</span>

              <Button
                aria-label={t("RecordWidgets.removeFilter")}
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
      </div>
    );
    if (section === "data") return dataContent;
    if (section === "filters") return filtersContent;
    if (section === "preview") return previewContent;
    return (
      <WidgetEditorColumns
        preview={<section id="widget-config-preview">{previewContent}</section>}
        settings={
          <EditorTabs
            contentClassName="space-y-4 pt-4"
            label={t("Dashboard.widgetEditor.settings")}
            tabs={[
              {
                id: "data",
                label: t("Dashboard.widgetEditor.tabs.data"),
                fields: [
                  "name",
                  "measure.source.typeId",
                  "measure.aggregation",
                  "measure.valueFieldId",
                  "measure.groupBy",
                ],
                content: (
                  <>
                    {settingsHeader}

                    {dataContent}
                  </>
                ),
              },
              {
                id: "filters",
                label: t("Dashboard.widgetEditor.tabs.filtersLabel", { count: filterCount }),
                fields: ["measure.source.filters", "measure.source.relatedFilters", "measure.groupBy.filter"],
                content: <section id="widget-config-filters">{filtersContent}</section>,
              },
              {
                id: "appearance",
                label: t("Dashboard.widgetEditor.tabs.appearance"),
                fields: ["displayOptions", "isTemplate"],
                content: typeof appearance === "function" ? appearance(model) : appearance,
              },
            ]}
          />
        }
      />
    );
  },
);
