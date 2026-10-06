"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { RecordRef } from "@/features/records/record-model.schema";
import type { RecordActivityFilter, RecordActivityQuery } from "@/ee/messaging/activities/record-activities.schema";
import type { WidgetModalStore } from "./widget-modal.store";
import { RecordActivityQuerySchema } from "@/ee/messaging/activities/record-activities.schema";
import { ACTIVITY_KINDS } from "@/ee/messaging/activities/activities.schema";
import { MessagingProviderSchema } from "@/ee/messaging/messaging.schema";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormAutocompleteItem } from "@/components/forms/form-autocomplete-item";
import { FormSelect } from "@/components/forms/form-select";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { useAppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { RecordAiAction } from "@/app/components/agent-chat/record-ai-action";
import { recordSearchLabel } from "@/features/records/record-search.schema";
import { useRootStore } from "@/core/stores/root-store.provider";
import { getRecordChoicesAction, getRecordModelAction } from "../../records/actions";
import { resolveSearchReferencesAction } from "../../search/actions";
import { getMessagingThreadsAction } from "../../inbox/actions";
import { discoverWidgetRecordTypesAction } from "../actions";
import { isRecordActivityWidgetForm } from "./record-widget-form";
import { WidgetEditorColumns, WidgetEditorSection } from "./widget-editor-layout";
import { WidgetPreviewFrame } from "./widget-preview-frame";
import { RecordActivityWidgetCard } from "./record-activity-widget-card";
import { ActivityTimelineSkeleton } from "@/features/messaging/activities/activity-timeline-skeleton";
import { useDebouncedValue } from "@/core/utils/use-debounced-value";

const PREVIEW_DELAY_MS = 600;

type Choice = { id: string; label: string };
const selectedIds = (value: string | string[] | undefined) =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];

function RecordSelection({
  id,
  typeId,
  value,
  onChange,
}: {
  id: string;
  typeId: string;
  value: string[];
  onChange?: (ids: string[]) => void;
}) {
  const t = useTranslations();
  const [choices, setChoices] = useState<Choice[]>([]);
  const key = JSON.stringify([typeId, value]);
  useEffect(() => {
    let active = true;
    const [typeId, ids] = JSON.parse(key) as [string, string[]];
    if (typeId && ids.length) {
      void resolveSearchReferencesAction({ refs: ids.map((recordId) => ({ typeId, recordId })) })
        .then((result) => {
          if (active && result.ok) {
            setChoices(
              result.data.results.map((record) => ({ id: record.ref.recordId, label: recordSearchLabel(record, t) })),
            );
          }
        })
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [key, t]);
  const getItems = useCallback(
    async ({ searchTerm }: { searchTerm?: string }) => {
      const result = await getRecordChoicesAction({ typeId, search: searchTerm, page: 1, pageSize: 50 });
      if (!result.ok) throw new Error("Record choices unavailable");
      return {
        items: result.data.records.map((record) => ({
          id: record.ref.recordId,
          label:
            record.title.state === "value" && record.title.value.kind === "text"
              ? record.title.value.value
              : t("Common.inputs.unavailableSelection"),
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
}

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
    const root = useRootStore();
    const formDisabled = useAppForm()?.isDisabled ?? false;
    const form = store.form;
    const [typeNames, setTypeNames] = useState<Array<{ id: string; pluralLabel: string }>>([]);
    const query = isRecordActivityWidgetForm(form) ? form.activityQuery : null;
    const [refreshes, setRefreshes] = useState(0);
    const validQuery = query && RecordActivityQuerySchema.safeParse(query).success ? JSON.stringify(query) : null;
    const previewQuery = useDebouncedValue(validQuery, PREVIEW_DELAY_MS);
    const typeIds = query
      ? [
          ...new Set(
            [
              ...query.scope.typeIds,
              ...query.scope.records.map((ref) => ref.typeId),
              ...(query.filters ?? []).flatMap((filter) => (filter.kind === "record" ? [filter.typeId] : [])),
            ].filter(Boolean),
          ),
        ]
      : [];
    const typeKey = JSON.stringify(typeIds);
    useEffect(() => {
      let active = true;
      const ids = JSON.parse(typeKey) as string[];
      if (ids.length) {
        void getRecordModelAction(ids)
          .then((model) => {
            if (active) setTypeNames(model.types.map(({ id, pluralLabel }) => ({ id, pluralLabel })));
          })
          .catch(() => undefined);
      }
      return () => {
        active = false;
      };
    }, [typeKey]);
    const needsAccounts = Boolean(query?.filters?.some((filter) => filter.kind === "account"));
    useEffect(() => {
      if (needsAccounts) void root.connectedAccountsStore.ensureLoaded().catch(() => undefined);
    }, [root, needsAccounts]);
    if (!isRecordActivityWidgetForm(form) || !query) return null;
    const sources = ACTIVITY_KINDS.map((id) => ({
      id,
      label: t(
        id === "audit"
          ? "EntityTimeline.types.changes"
          : id === "message"
            ? "EntityTimeline.types.messages"
            : id === "calendar_event"
              ? "ContactHistory.calendarMeeting"
              : "EntityTimeline.types.activities",
      ),
    }));
    const providers = MessagingProviderSchema.options.map((id) => ({ id, label: t(`Common.providers.${id}`) }));
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
    const threadSelection = (id: string) => (
      <FormAutocomplete<{ id: string; subject: string | null; name: string | null }>
        getItems={getMessagingThreadsAction}
        id={id}
        label={t("Common.filters.fields.timelineThreadId")}
        renderValue={(items) =>
          items
            .map((item) => item.data?.subject ?? item.data?.name ?? t("Common.inputs.unavailableSelection"))
            .join(", ")
        }
        selectionMode="multiple"
      >
        {(thread) => (
          <FormAutocompleteItem textValue={thread.subject ?? thread.name ?? t("Common.inputs.unavailableSelection")}>
            {thread.subject ?? thread.name ?? t("Common.inputs.unavailableSelection")}
          </FormAutocompleteItem>
        )}
      </FormAutocomplete>
    );
    const previewContent = (
      <div className="min-w-0 space-y-3">
        {form.id && (
          <RecordAiAction
            active={store.isOpen}
            context={{ reference: { kind: "widget", widgetId: form.id }, label: form.name }}
          />
        )}

        <WidgetPreviewFrame
          geometry={store.previewGeometry}
          kind={form.kind}
          refreshDisabled={formDisabled || !previewQuery}
          refreshLabel={t("Dashboard.widgetEditor.preview.title")}
          onRefresh={() => setRefreshes((count) => count + 1)}
        >
          {previewQuery ? (
            <div className="h-full" data-preview-current={previewQuery === validQuery}>
              <RecordActivityWidgetCard
                key={`${previewQuery}:${refreshes}`}
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
    const filters = query.filters ?? [];
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

        {filters.map((filter, index) => {
          const id = `activityQuery.filters[${index}]`;
          const operators = filter.kind === "record" ? ["in", "notIn", "hasSome", "hasNone"] : ["in", "notIn"];
          const presence = filter.kind === "record" && (filter.operator === "hasSome" || filter.operator === "hasNone");
          return (
            <div key={index} className="space-y-3 border-b border-border pb-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{t(`RecordActivityWidgets.filterKinds.${filter.kind}`)}</span>

                <Button
                  aria-label={t("RecordWidgets.removeFilter")}
                  disabled={formDisabled}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    store.onChange(
                      "activityQuery.filters",
                      filters.filter((_, offset) => offset !== index),
                    )
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>

              {filter.kind === "record" && (
                <FormAutocomplete<{ id: string; pluralLabel: string }>
                  getItems={discoverWidgetRecordTypesAction}
                  id={`${id}.typeId`}
                  items={typeNames}
                  label={t("RecordWidgets.source")}
                  renderValue={(items) =>
                    items.map((item) => item.data?.pluralLabel ?? t("Common.inputs.unavailableSelection")).join(", ")
                  }
                  onValueChange={(typeId) => store.onChange(id, { ...filter, typeId, recordIds: [] })}
                >
                  {(type) => (
                    <FormAutocompleteItem textValue={type.pluralLabel}>{type.pluralLabel}</FormAutocompleteItem>
                  )}
                </FormAutocomplete>
              )}

              <FormSelect
                id={`${id}.operator`}
                items={operators.map((value) => ({ value, label: t(`RecordActivityWidgets.operators.${value}`) }))}
                label={t("RecordWidgets.filterOperator")}
                onValueChange={(operator) =>
                  store.onChange(id, {
                    ...filter,
                    operator,
                    ...(filter.kind === "record" && ["hasSome", "hasNone"].includes(operator) ? { recordIds: [] } : {}),
                  })
                }
              />

              {filter.kind === "record" && !presence && (
                <RecordSelection id={`${id}.recordIds`} typeId={filter.typeId} value={filter.recordIds} />
              )}

              {filter.kind === "source" && multi(`${id}.values`, t("Common.filters.fields.timelineKind"), sources)}

              {filter.kind === "provider" &&
                multi(`${id}.values`, t("RecordActivityWidgets.filterKinds.provider"), providers)}

              {filter.kind === "account" &&
                multi(
                  `${id}.values`,
                  t("Common.filters.fields.connectedAccountId"),
                  root.connectedAccountsStore.items.map((account) => ({
                    id: account.id,
                    label: account.displayName ?? account.emailAddress ?? t(`Common.providers.${account.provider}`),
                  })),
                )}

              {filter.kind === "thread" && threadSelection(`${id}.values`)}
            </div>
          );
        })}

        <FormSelect
          disabled={filters.length >= 20}
          id="activity-add-filter"
          items={["record", "source", "provider", "account", "thread"].map((value) => ({
            value,
            label: t(`RecordActivityWidgets.filterKinds.${value}`),
          }))}
          label={t("RecordWidgets.addFilter")}
          value=""
          onValueChange={(kind) => {
            const next =
              kind === "record"
                ? { kind, typeId: scopeTypes[0] ?? "", operator: "hasSome", recordIds: [] }
                : { kind, operator: "in", values: [] };
            store.onChange("activityQuery.filters", [...filters, next as RecordActivityFilter]);
          }}
        />

        {query.providers !== undefined &&
          multi("activityQuery.providers", t("RecordActivityWidgets.filterKinds.provider"), providers)}

        {query.threadIds !== undefined && (
          <div className="space-y-2">
            {threadSelection("activityQuery.threadIds")}

            <Button
              disabled={formDisabled}
              type="button"
              variant="secondary"
              onClick={() => store.onChange("activityQuery.threadIds", undefined)}
            >
              {t("RecordActivityWidgets.clearConversation")}
            </Button>
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <FormIsoDatePicker dateOnly={false} id="activityQuery.after" label={t("RecordActivityWidgets.after")} />

          <FormIsoDatePicker dateOnly={false} id="activityQuery.before" label={t("RecordActivityWidgets.before")} />
        </div>
      </div>
    );
    if (section === "data") return dataContent;
    if (section === "preview") return previewContent;
    return (
      <WidgetEditorColumns
        preview={<section id="widget-config-preview">{previewContent}</section>}
        settings={
          <>
            {settingsHeader}

            <WidgetEditorSection id="widget-config-data" title={t("Dashboard.widgetEditor.tabs.data")}>
              {dataContent}
            </WidgetEditorSection>

            {appearance}
          </>
        }
      />
    );
  },
);
