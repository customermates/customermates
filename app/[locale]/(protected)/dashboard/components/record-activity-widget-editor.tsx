"use client";

import { useCallback, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordActivityQuery } from "@/ee/messaging/activities/record-activities.schema";
import type { WidgetModalStore } from "./widget-modal.store";
import { RecordActivityQuerySchema } from "@/ee/messaging/activities/record-activities.schema";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { recordDisplayName } from "@/features/records/record-display-name";
import { getRecordChoicesAction } from "../../records/actions";
import { discoverWidgetRecordTypesAction } from "../actions";
import { isRecordActivityWidgetForm } from "./record-widget-form";
import {
  WidgetEditorColumns,
  WidgetEditorSegments,
  initialWidgetEditorSegment,
  opensWidgetFilters,
} from "./widget-editor-layout";
import { recordActivityFilterCount } from "@/ee/messaging/activities/record-activity-sources";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import { WidgetPreviewFrame } from "./widget-preview-frame";
import { RecordActivityWidgetCard } from "./record-activity-widget-card";
import { ActivityTimelineSkeleton } from "@/features/messaging/activities/activity-timeline-skeleton";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";
import { useRootStore } from "@/core/stores/root-store.provider";
import { RecordActivityFilters, useActivitySourceChoices } from "@/components/records/record-activity-filters";

const PREVIEW_DELAY_MS = 600;

type Choice = { id: string; label: string };
const selectedIds = (value: string | string[] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

const RecordSelection = observer(function RecordSelection({
  store,
  id,
  typeId,
  value,
  onChange,
}: {
  store: WidgetModalStore;
  id: string;
  typeId: string;
  value: string[];
  onChange?: (ids: string[]) => void;
}) {
  const t = useTranslations();
  const choices: Choice[] = store.scopeRecordHits
    .filter((record) => record.ref.typeId === typeId)
    .map((record) => ({ id: record.ref.recordId, label: recordDisplayName(record.title, record.typeLabel, t) }));
  const getItems = useCallback(
    async ({ searchTerm }: { searchTerm?: string }) => {
      const result = await getRecordChoicesAction({ typeId, search: searchTerm, page: 1, pageSize: 50 });
      if (!result.ok) throw new Error("Record choices unavailable");
      return {
        items: result.data.records.map((record) => ({
          id: record.ref.recordId,
          label: recordDisplayName(record.title, result.data.typeLabel, t),
        })),
        total: result.data.total,
      };
    },
    [typeId, t],
  );
  return (
    <FormAutocomplete<Choice>
      disabled={!typeId}
      getItems={getItems}
      id={id}
      items={choices}
      label={t("RecordActivityWidgets.records")}
      renderValue={(items) =>
        items.map((item) => item.data?.label ?? t("Common.inputs.unavailableSelection")).join(", ")
      }
      selectionMode="multiple"
      value={value}
      onValueChange={onChange ? (next) => onChange(selectedIds(next)) : undefined}
    >
      {(item) => <FormAutocompleteItem textValue={item.label}>{item.label}</FormAutocompleteItem>}
    </FormAutocomplete>
  );
});

export const RecordActivityWidgetEditor = observer(
  ({
    store,
    section,
    appearance,
    settingsHeader,
  }: {
    store: WidgetModalStore;
    appearance?: ReactNode;
    settingsHeader?: ReactNode;
    section: "data" | "preview" | "all";
  }) => {
    const t = useTranslations();
    const sources = useActivitySourceChoices();
    const form = store.form;
    const { recordWorkspaceStore } = useRootStore();
    const typeNames = recordWorkspaceStore.navigation?.types ?? [];
    const query = isRecordActivityWidgetForm(form) ? form.activityQuery : null;
    const validQuery = query && RecordActivityQuerySchema.safeParse(query).success ? JSON.stringify(query) : null;
    const previewQuery = useDebouncedValue(validQuery, PREVIEW_DELAY_MS);
    if (!isRecordActivityWidgetForm(form) || !query) return null;
    const multi = (id: string, label: string, choices: Choice[]) => (
      <FormAutocomplete<Choice>
        id={id}
        items={choices}
        label={label}
        renderValue={(items) =>
          items.map((item) => item.data?.label ?? t("Common.inputs.unavailableSelection")).join(", ")
        }
        selectionMode="multiple"
      >
        {(item) => <FormAutocompleteItem textValue={item.label}>{item.label}</FormAutocompleteItem>}
      </FormAutocomplete>
    );
    const scopeTypes = [...new Set([...query.scope.typeIds, ...query.scope.records.map((ref) => ref.typeId)])];
    const previewContent = (
      <div className="min-w-0 space-y-3">
        <WidgetPreviewFrame
          geometry={store.previewGeometry}
          kind={form.kind}
          loading={Boolean(validQuery) && previewQuery !== validQuery}
        >
          {previewQuery ? (
            <div className="h-full" data-preview-current={previewQuery === validQuery}>
              <RecordActivityWidgetCard
                widget={{
                  id: form.id ?? "",
                  name: form.name.trim() || t("Dashboard.widgetEditor.preview.untitled"),
                  activityQuery: JSON.parse(previewQuery) as RecordActivityQuery,
                  displayOptions: form.displayOptions,
                }}
              />
            </div>
          ) : (
            <div className="h-full rounded-xl border border-dashed border-border p-6">
              <ActivityTimelineSkeleton animated={false} rows={4} />
            </div>
          )}
        </WidgetPreviewFrame>
      </div>
    );
    const dataContent = (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("RecordActivityWidgets.scopeHelp")}</p>

        {multi("activityQuery.kinds", t("Common.filters.fields.timelineKind"), sources)}

        <FormAutocomplete<{ id: string; pluralLabel: string }>
          getItems={discoverWidgetRecordTypesAction}
          id="activity-scope-types"
          items={typeNames}
          label={t("RecordActivityWidgets.types")}
          renderValue={(items) =>
            items.map((item) => item.data?.pluralLabel ?? t("Common.inputs.unavailableSelection")).join(", ")
          }
          selectionMode="multiple"
          value={scopeTypes}
          onValueChange={(next) => {
            const selected = selectedIds(next);
            store.onChange("activityQuery.scope", {
              records: query.scope.records.filter((ref) => selected.includes(ref.typeId)),
              typeIds: selected.filter((typeId) => !query.scope.records.some((ref) => ref.typeId === typeId)),
            });
          }}
        >
          {(type) => <FormAutocompleteItem textValue={type.pluralLabel}>{type.pluralLabel}</FormAutocompleteItem>}
        </FormAutocomplete>

        {scopeTypes.map((typeId) => (
          <div key={typeId} className="space-y-2">
            <p className="text-sm font-medium">
              {typeNames.find((type) => type.id === typeId)?.pluralLabel ?? t("Loading.text")}
            </p>

            <RecordSelection
              id={`activity-scope-${typeId}`}
              store={store}
              typeId={typeId}
              value={query.scope.records.filter((ref) => ref.typeId === typeId).map((ref) => ref.recordId)}
              onChange={(ids) =>
                store.onChange("activityQuery.scope", {
                  typeIds: [...query.scope.typeIds.filter((id) => id !== typeId), ...(ids.length ? [] : [typeId])],
                  records: [
                    ...query.scope.records.filter((ref) => ref.typeId !== typeId),
                    ...ids.map((recordId): RecordRef => ({ typeId, recordId })),
                  ],
                })
              }
            />

            <p className="text-xs text-muted-foreground">{t("RecordActivityWidgets.allRecords")}</p>
          </div>
        ))}
      </div>
    );
    const filtersContent = <RecordActivityFilters store={store} types={typeNames} />;
    if (section === "data") return dataContent;
    if (section === "preview") return previewContent;
    return (
      <WidgetEditorColumns
        preview={<section id="widget-config-preview">{previewContent}</section>}
        settings={
          <WidgetEditorSegments
            appearance={appearance}
            appearanceFields={["displayOptions", "isTemplate"]}
            data={
              <>
                {settingsHeader}

                {dataContent}

                <CollapsibleSection
                  defaultOpen={opensWidgetFilters(store.expandedSection)}
                  id="widget-config-filters"
                  summary={t("Dashboard.widgetEditor.sections.activeFilters", {
                    count: recordActivityFilterCount(query),
                  })}
                  title={t("Dashboard.widgetEditor.sections.filters")}
                >
                  {filtersContent}
                </CollapsibleSection>
              </>
            }
            dataFields={["name", "activityQuery"]}
            initial={initialWidgetEditorSegment(store.expandedSection)}
          />
        }
      />
    );
  },
);
