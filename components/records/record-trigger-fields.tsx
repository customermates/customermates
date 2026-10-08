"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import type { RecordModelView } from "@/features/records/record-model.schema";
import type { RecordEventSubscriptionDefinition } from "@/features/records/record-event-subscription.schema";
import { FormSelect } from "@/components/forms/form-select";
import { FormAutocomplete } from "@/components/forms/form-autocomplete";
import { FormLabel } from "@/components/forms/form-label";
import { AppChip } from "@/components/chip/app-chip";
import { RecordQueryFilters } from "./record-query-filters";

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
      recordModel: RecordModelView | null;
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

            <RecordQueryFilters
              anchorId="record-trigger-filters"
              id="recordTrigger.query"
              model={model}
              typeId={trigger.query.typeId}
            />

            <p className="text-subdued text-xs">{t("RecordTriggers.triggerFiltersHelp")}</p>
          </div>
        )}
      </div>
    );
  },
);
