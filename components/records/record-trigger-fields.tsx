"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordModel } from "@/features/records/record-model.schema";
import type { RecordEventSubscriptionDefinition } from "@/features/records/record-event-subscription.schema";
import { recordFilterFields } from "@/features/records/record-filter";
import { FormSelect } from "@/components/forms/form-select";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormInput } from "@/components/forms/form-input";
import { FormLabel } from "@/components/forms/form-label";
import { AppChip } from "@/components/chip/app-chip";
import {
  RecordWidgetFieldFilters,
  RecordWidgetRelatedFilters,
} from "@/app/[locale]/(protected)/dashboard/components/record-widget-filters";

export type RecordTriggerForm = {
  query: NonNullable<RecordEventSubscriptionDefinition["query"]>;
  changedFieldIds: string[];
};

export const RecordTriggerFields = observer(
  ({
    store,
    allowAllTypes = false,
  }: {
    store: {
      form: { recordTrigger?: RecordTriggerForm | null };
      recordModel: RecordModel | null;
      watchesRecordChanges: boolean;
      onChange: (id: string, value: unknown) => void;
    };
    allowAllTypes?: boolean;
  }) => {
    const t = useTranslations();
    const trigger = store.form.recordTrigger;
    const model = store.recordModel;
    if (!model) return null;
    const fields = model.fields.filter((field) => field.typeId === trigger?.query.typeId && !field.archived);
    const watched = fields.map((field) => ({ key: field.id, label: field.label }));
    const filterFields = recordFilterFields(fields, {
      createdAt: t("RecordModel.createdAt"),
      updatedAt: t("RecordModel.updatedAt"),
      assignedTo: t("RecordModel.assignedTo"),
    });
    return (
      <div data-record-trigger className="space-y-4">
        <FormSelect
          required
          id="recordTrigger.query.typeId"
          items={[
            ...(allowAllTypes ? [{ value: "all", label: t("WebhookModal.allAccessibleTypes") }] : []),
            ...model.types
              .filter((type) => !type.archived)
              .map((type) => ({ value: type.id, label: type.pluralLabel })),
          ]}
          label={t("RecordWidgets.source")}
          value={trigger?.query.typeId ?? (allowAllTypes ? "all" : "")}
          onValueChange={(typeId) =>
            store.onChange(
              "recordTrigger",
              typeId === "all"
                ? null
                : {
                    query: { typeId, filters: [], relationships: [] },
                    changedFieldIds: [],
                  },
            )
          }
        />

        {trigger && store.watchesRecordChanges && (
          <div className="space-y-1.5">
            <FormAutocomplete
              id="recordTrigger.changedFieldIds"
              items={watched}
              label={t("Common.inputs.changedFields")}
              renderValue={(items) =>
                items.map((item) => (
                  <AppChip key={item.key}>{item.data?.label ?? t("RecordWidgets.unavailable")}</AppChip>
                ))
              }
              selectionMode="multiple"
            >
              {(item) => <span>{item.label}</span>}
            </FormAutocomplete>

            <p className="text-subdued text-xs">{t("RecordTriggers.changedFieldsHelp")}</p>
          </div>
        )}

        {trigger && (
          <div className="space-y-3">
            <FormLabel>{t("Common.inputs.triggerFilters")}</FormLabel>

            <FormInput id="recordTrigger.query.search" label={t("RecordWidgets.search")} />

            <RecordWidgetFieldFilters
              fields={filterFields}
              filters={trigger.query.filters}
              id="recordTrigger.query.filters"
              store={store}
            />

            <RecordWidgetRelatedFilters
              filters={trigger.query.relatedFilters ?? []}
              id="recordTrigger.query.relatedFilters"
              model={model}
              store={store}
              typeId={trigger.query.typeId}
            />

            <p className="text-subdued text-xs">{t("RecordTriggers.triggerFiltersHelp")}</p>
          </div>
        )}
      </div>
    );
  },
);
