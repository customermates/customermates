"use client";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import type { RecordModel, RecordScalar } from "@/features/records/record-model.schema";
import type { RecordQuery } from "@/features/records/record-query.schema";
import type { RecordFilterField } from "@/features/records/record-filter";
import { recordFilterFields, recordFilterOperators } from "@/features/records/record-filter";
import { filterScalar } from "@/features/records/record-presentation";
import { FormAutocompleteAvatar } from "@/components/forms/form-autocomplete-avatar";
import { FormInput } from "@/components/forms/form-input";
import { FormSelect } from "@/components/forms/form-select";
import { FormSwitch } from "@/components/forms/form-switch";
import { FormIsoDatePicker } from "@/components/forms/form-iso-date-picker";
import { useAppForm } from "@/components/forms/form-context";
import { Button } from "@/components/ui/button";
import { useRootStore } from "@/core/stores/root-store.provider";
import { toLocalIso } from "@/components/forms/iso-date-values";
import { getUsersAction } from "../../company/actions";

const ScalarInput = observer(({ field, id, label }: { field: RecordFilterField; id: string; label?: string }) => {
  const t = useTranslations();
  const { userStore } = useRootStore();
  if (field.valueType === "select") {
    return (
      <FormSelect
        id={`${id}.value`}
        items={field.options.map((option) => ({ value: option.id, label: option.label }))}
        label={label ?? t("RecordWidgets.filterValue")}
      />
    );
  }
  if (field.valueType === "boolean")
    return <FormSwitch id={`${id}.value`} label={label ?? t("RecordWidgets.filterValue")} />;
  if (["date", "dateTime", "dateRange", "dateTimeRange"].includes(field.valueType)) {
    return (
      <FormIsoDatePicker
        dateOnly={field.valueType === "date" || field.valueType === "dateRange"}
        id={`${id}.value`}
        label={label ?? t("RecordWidgets.filterValue")}
      />
    );
  }
  if (field.valueType === "member") {
    return (
      <FormAutocompleteAvatar
        getItems={getUsersAction}
        id={`${id}.value`}
        items={userStore.user ? [userStore.user] : []}
        label={label ?? t("RecordWidgets.filterValue")}
      />
    );
  }
  return (
    <FormInput
      id={`${id}.value`}
      inputMode={["number", "currency"].includes(field.valueType) ? "decimal" : undefined}
      label={label ?? t("RecordWidgets.filterValue")}
    />
  );
});

export const RecordWidgetFieldFilters = observer(
  ({
    store,
    id,
    filters,
    fields,
    disabled,
  }: {
    store: { onChange: (id: string, value: unknown) => void };
    id: string;
    filters: RecordQuery["filters"];
    fields: RecordFilterField[];
    disabled?: boolean;
  }) => {
    const t = useTranslations();
    const formDisabled = useAppForm()?.isDisabled ?? false;
    const defaults = (field: RecordFilterField): RecordScalar =>
      filterScalar(
        field.valueType === "boolean"
          ? "false"
          : ["number", "currency"].includes(field.valueType)
            ? "0"
            : field.valueType === "select"
              ? (field.options[0]?.id ?? "")
              : field.valueType === "date" || field.valueType === "dateRange"
                ? toLocalIso(new Date(), true)
                : field.valueType === "dateTime" || field.valueType === "dateTimeRange"
                  ? new Date().toISOString()
                  : "",
        field,
      );
    return (
      <div className="space-y-3">
        {filters.map((filter, index) => {
          const field = fields.find((field) => field.id === filter.fieldId);
          if (!field) {
            return (
              <p key={index} role="alert">
                {t("RecordWidgets.unavailable")}
              </p>
            );
          }
          const filterId = `${id}[${index}]`;
          const many = filter.operator === "in" || filter.operator === "notIn";
          return (
            <div key={`${field.id}:${index}`} className="space-y-3 border-b border-border pb-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{field.label}</span>

                <Button
                  aria-label={t("RecordWidgets.removeFilter")}
                  disabled={formDisabled}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    store.onChange(
                      id,
                      filters.filter((_, offset) => offset !== index),
                    )
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>

              <FormSelect
                id={`${filterId}.operator`}
                items={recordFilterOperators(field).map((value) => ({
                  value,
                  label: t(`RecordWidgets.operators.${value}`),
                }))}
                label={t("RecordWidgets.filterOperator")}
                onValueChange={(operator) =>
                  store.onChange(filterId, {
                    fieldId: field.id,
                    operator,
                    value: ["empty", "notEmpty", "in", "notIn", "between"].includes(operator)
                      ? null
                      : operator === "inLastDays" || operator === "notInLastDays"
                        ? { kind: "decimal", value: "30", currency: null }
                        : defaults(field),
                    ...(["in", "notIn", "between"].includes(operator)
                      ? { values: operator === "between" ? [defaults(field), defaults(field)] : [defaults(field)] }
                      : {}),
                  })
                }
              />

              {filter.operator === "between" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <ScalarInput field={field} id={`${filterId}.values[0]`} label={t("RecordWidgets.filterFrom")} />

                  <ScalarInput field={field} id={`${filterId}.values[1]`} label={t("RecordWidgets.filterUntil")} />
                </div>
              ) : filter.operator === "inLastDays" || filter.operator === "notInLastDays" ? (
                <FormInput id={`${filterId}.value.value`} inputMode="numeric" label={t("RecordWidgets.filterDays")} />
              ) : many ? (
                <div className="space-y-2">
                  {filter.values?.map((_, offset) => (
                    <div key={offset} className="flex items-end gap-2">
                      <ScalarInput field={field} id={`${filterId}.values[${offset}]`} />

                      <Button
                        aria-label={t("RecordWidgets.removeFilter")}
                        disabled={formDisabled}
                        size="icon"
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          store.onChange(
                            `${filterId}.values`,
                            filter.values?.filter((_, i) => i !== offset),
                          )
                        }
                      >
                        <X className="size-4" />
                      </Button>
                    </div>
                  ))}

                  <Button
                    disabled={formDisabled || (filter.values?.length ?? 0) >= 100}
                    type="button"
                    variant="ghost"
                    onClick={() => store.onChange(`${filterId}.values`, [...(filter.values ?? []), defaults(field)])}
                  >
                    {t("RecordModel.addInput")}
                  </Button>
                </div>
              ) : (
                !["empty", "notEmpty"].includes(filter.operator) && (
                  <ScalarInput field={field} id={`${filterId}.value`} />
                )
              )}
            </div>
          );
        })}

        <FormSelect
          disabled={disabled || filters.length >= 50}
          id={`${id}-add-filter`}
          items={fields
            .filter((field) => recordFilterOperators(field).length > 0)
            .map((field) => ({ value: field.id, label: field.label }))}
          label={t("RecordWidgets.addFilter")}
          value=""
          onValueChange={(value) => {
            const field = fields.find((field) => field.id === value);
            if (field) {
              store.onChange(id, [
                ...filters,
                { fieldId: field.id, operator: recordFilterOperators(field)[0], value: defaults(field) },
              ]);
            }
          }}
        />
      </div>
    );
  },
);

export function widgetRelationshipChoices(model: RecordModel | undefined | null, typeId: string) {
  return (
    model?.relationships
      .filter((relation) => !relation.archived)
      .flatMap((relation) => [
        ...(relation.sourceTypeId === typeId
          ? [{ value: `${relation.id}:outgoing`, label: relation.sourceLabel }]
          : []),
        ...(relation.targetTypeId === typeId
          ? [{ value: `${relation.id}:incoming`, label: relation.targetLabel }]
          : []),
      ]) ?? []
  );
}

export const RecordWidgetRelatedFilters = observer(
  ({
    store,
    model,
    typeId: sourceTypeId,
    id: filtersId,
    filters: relatedFilters,
  }: {
    store: { onChange: (id: string, value: unknown) => void };
    model: RecordModel | undefined | null;
    typeId: string;
    id: string;
    filters: NonNullable<RecordQuery["relatedFilters"]>;
  }) => {
    const t = useTranslations();
    const formDisabled = useAppForm()?.isDisabled ?? false;
    const labels = {
      createdAt: t("RecordModel.createdAt"),
      updatedAt: t("RecordModel.updatedAt"),
      assignedTo: t("RecordModel.assignedTo"),
    };
    return (
      <section className="space-y-4">
        <p className="text-xs text-muted-foreground">{t("RecordWidgets.relatedFilterHelp")}</p>

        {relatedFilters.map((filter, index) => {
          const id = `${filtersId}[${index}]`;
          let typeId = sourceTypeId;
          const pathLabels = filter.path.map((step) => {
            const relation = model?.relationships.find((relation) => relation.id === step.relationId);
            if (!relation) return t("RecordWidgets.unavailable");
            typeId = step.direction === "outgoing" ? relation.targetTypeId : relation.sourceTypeId;
            return step.direction === "outgoing" ? relation.sourceLabel : relation.targetLabel;
          });
          return (
            <div key={index} className="space-y-3 border-b border-border pb-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{pathLabels.join(" / ")}</span>

                <Button
                  aria-label={t("RecordWidgets.removeFilter")}
                  disabled={formDisabled}
                  size="icon"
                  type="button"
                  variant="ghost"
                  onClick={() =>
                    store.onChange(
                      filtersId,
                      relatedFilters.filter((_, offset) => offset !== index),
                    )
                  }
                >
                  <X className="size-4" />
                </Button>
              </div>

              <FormSelect
                id={`${id}.operator`}
                items={[
                  { value: "any", label: t("RecordWidgets.relatedAny") },
                  { value: "none", label: t("RecordWidgets.relatedNone") },
                ]}
                label={t("RecordWidgets.relatedMatch")}
              />

              <FormSelect
                disabled={!model || filter.path.length >= 6}
                id={`${id}-path`}
                items={widgetRelationshipChoices(model, typeId)}
                label={t("RecordWidgets.groupPath")}
                value=""
                onValueChange={(next) => {
                  const [relationId, direction] = next.split(":");
                  store.onChange(id, {
                    path: [...filter.path, { relationId, direction }],
                    operator: filter.operator,
                    filters: [],
                    relationships: [],
                  });
                }}
              />

              <FormInput id={`${id}.search`} label={t("RecordWidgets.search")} />

              <RecordWidgetFieldFilters
                disabled={!model}
                fields={recordFilterFields(model?.fields.filter((field) => field.typeId === typeId) ?? [], labels)}
                filters={filter.filters}
                id={`${id}.filters`}
                store={store}
              />
            </div>
          );
        })}

        <FormSelect
          disabled={!model || relatedFilters.length >= 16}
          id={`${filtersId}-add-related-filter`}
          items={widgetRelationshipChoices(model, sourceTypeId)}
          label={t("RecordWidgets.addRelatedFilter")}
          value=""
          onValueChange={(next) => {
            const [relationId, direction] = next.split(":");
            store.onChange(filtersId, [
              ...relatedFilters,
              { path: [{ relationId, direction }], operator: "any", filters: [], relationships: [] },
            ]);
          }}
        />
      </section>
    );
  },
);
