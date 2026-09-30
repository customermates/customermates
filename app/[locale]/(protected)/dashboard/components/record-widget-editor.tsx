"use client";

import { z } from "zod";
import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { RecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { X } from "lucide-react";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordMeasureResult } from "@/features/records/record-measure.schema";
import type { WidgetModalStore } from "./widget-modal.store";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { Button } from "@/components/ui/button";
import { runUserAction } from "@/core/errors/report-application-error";
import { toastZodErrorTree } from "@/core/utils/toast-zod-error-tree";
import { getRecordModelAction } from "../../records/actions";
import { discoverWidgetRecordTypesAction, previewRecordWidgetAction } from "../actions";
import { isRecordWidgetForm } from "./record-widget-form";
import { RecordWidgetChart } from "./record-widget-chart";
import { recordFilterFields } from "@/features/records/record-filter";
import {
  RecordWidgetFieldFilters,
  RecordWidgetRelatedFilters,
  widgetRelationshipChoices,
} from "./record-widget-filters";

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
  const [state, setState] = useState<{ key: string; model: RecordModel | null } | null>(null);
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
  ({ store, section }: { store: WidgetModalStore; section: "data" | "filters" | "preview" }) => {
    const t = useTranslations();
    const { model, retry } = useWidgetModel(store);
    const form = store.form;
    const [preview, setPreview] = useState<{ key: string; result: RecordMeasureResult } | null>(null);
    const [loading, setLoading] = useState(false);
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
    if (section === "preview") {
      return (
        <section className="min-w-0 space-y-3 rounded-xl border border-border p-4">
          <h3 className="text-sm font-medium">{t("RecordWidgets.preview")}</h3>

          {form.id && (
            <RecordAiAction
              active={store.isOpen}
              context={{ reference: { kind: "widget", widgetId: form.id }, label: form.name }}
            />
          )}

          <p className="text-xs text-muted-foreground">{t("RecordWidgets.previewHelp")}</p>

          <Button
            disabled={loading || !model}
            type="button"
            variant="secondary"
            onClick={() =>
              runUserAction(async () => {
                setLoading(true);
                try {
                  const parsed = RecordMeasureSchema.safeParse(measure);
                  if (!parsed.success) {
                    toastZodErrorTree(z.treeifyError(parsed.error));
                    return;
                  }
                  const result = await previewRecordWidgetAction(parsed.data);
                  if (!result.ok) {
                    toastZodErrorTree(result.error);
                    return;
                  }
                  if (model && result.data.schemaRevision !== model.revision) {
                    retry();
                    return;
                  }
                  setPreview({ key, result: result.data });
                  store.onChange("expectedRevision", result.data.schemaRevision);
                } finally {
                  setLoading(false);
                }
              })
            }
          >
            {loading ? t("Loading.text") : t("RecordWidgets.preview")}
          </Button>

          {preview?.key === key && preview.result.schemaRevision === model?.revision && (
            <div className="h-64">
              <RecordWidgetChart
                data={preview.result}
                displayOptions={form.displayOptions}
                groupOptions={model?.fields.find((field) => field.id === measure.groupBy?.fieldId)?.options ?? []}
                measure={measure}
                status="ready"
              />
            </div>
          )}
        </section>
      );
    }
    if (section === "filters") {
      return (
        <div className="space-y-4">
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
    }
    const sourceType = model?.types.find((type) => type.id === measure.source.typeId);
    const relations = widgetRelationshipChoices(model, groupTypeId);
    return (
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
                : (sourceFields.find((field) => ["number", "currency"].includes(field.valueType))?.id ?? null),
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
          ]}
          label={t("RecordWidgets.group")}
          value={measure.groupBy ? (measure.groupBy.fieldId ?? "record") : "none"}
          onValueChange={(value) =>
            store.onChange(
              "measure.groupBy",
              value === "none"
                ? null
                : { ...measure.groupBy, path: measure.groupBy?.path ?? [], fieldId: value === "record" ? null : value },
            )
          }
        />
      </div>
    );
  },
);
