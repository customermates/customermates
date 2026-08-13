"use client";

import type { Filter, FilterableField } from "@/core/base/base-get.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";

import { FilterAccordion } from "@/components/data-view/filter-modal/filter-accordion";
import { FilterChipValue } from "@/components/data-view/filter-modal/filter-chip-display";
import { hasValidFilterConfiguration } from "@/components/data-view/table-view.utils";
import { useFilterFieldLabel } from "@/components/entity-terminology/use-filter-field-label";
import { useAppForm } from "@/components/forms/form-context";
import { SelectableCard } from "@/components/forms/selectable-card";
import { AppChip } from "@/components/chip/app-chip";
import { Badge } from "@/components/ui/badge";
import { FilterFieldKey } from "@/core/types/filter-field-key";

import { activityTypeStateForFilter, activityTypeSelectionFor, type ActivityTypeValue } from "./activity-filter-form";

type Props = {
  expandedField?: string;
  filterableFields: FilterableField[];
  filters: Filter[];
  onConnectedAccountChange?: () => void;
  onExpandedFieldChange?: (field: string) => void;
};

export const ActivityFilterFields = observer(
  ({ expandedField, filterableFields, filters, onConnectedAccountChange, onExpandedFieldChange }: Props) => {
    const t = useTranslations();
    const filterFieldLabel = useFilterFieldLabel();
    const form = useAppForm();
    const fieldsByKey = new Map(filterableFields.map((field) => [field.field, field]));
    const visibleFilters = filters
      .map((filter, index) => ({ filter, index }))
      .filter(({ filter }) => fieldsByKey.has(filter.field));
    const activityTypeEntry = visibleFilters.find(
      ({ filter }) => filter.field === FilterFieldKey.timelineKind.toString(),
    );
    const filterEntries = visibleFilters.filter(
      ({ filter }) => filter.field !== FilterFieldKey.timelineKind.toString(),
    );
    const activityTypeOptions: Array<{
      description: string;
      label: string;
      value: ActivityTypeValue;
    }> = [
      {
        description: t("Dashboard.widgetEditor.filters.activityTypeOptions.changes.description"),
        label: t("Dashboard.widgetEditor.filters.activityTypeOptions.changes.label"),
        value: "changes",
      },
      {
        description: t("Dashboard.widgetEditor.filters.activityTypeOptions.messages.description"),
        label: t("Dashboard.widgetEditor.filters.activityTypeOptions.messages.label"),
        value: "messages",
      },
      {
        description: t("Dashboard.widgetEditor.filters.activityTypeOptions.activities.description"),
        label: t("Dashboard.widgetEditor.filters.activityTypeOptions.activities.label"),
        value: "activities",
      },
    ];
    const activeFilterCount = filterEntries.filter(({ filter }) => hasValidFilterConfiguration(filter)).length;
    const hiddenFilterEntries = filters
      .map((filter, index) => ({ filter, index }))
      .filter(({ filter }) => !fieldsByKey.has(filter.field) && hasValidFilterConfiguration(filter));

    if (!visibleFilters.length && hiddenFilterEntries.length === 0)
      return <p className="text-sm text-muted-foreground">{t("Dashboard.widgetEditor.filters.noneAvailable")}</p>;

    return (
      <div className="flex min-w-0 flex-col gap-6">
        {activityTypeEntry && (
          <fieldset className="min-w-0">
            <legend className="mb-1.5 text-xs font-normal leading-none text-muted-foreground">
              {t("Dashboard.widgetEditor.filters.activityTypes")}
            </legend>

            <div className="grid gap-2 sm:grid-cols-3">
              {activityTypeOptions.map(({ description, label, value }) => (
                <SelectableCard
                  key={value}
                  checked={activityTypeStateForFilter(activityTypeEntry.filter, value)}
                  description={description}
                  disabled={form?.isDisabled}
                  id={`activity-type-${value}`}
                  label={label}
                  selectionMode="multiple"
                  onCheckedChange={(checked) => {
                    const next = activityTypeSelectionFor(activityTypeEntry.filter, value, checked);
                    form?.onChange(`timelineFilters[${activityTypeEntry.index}].operator`, next.operator);
                    form?.onChange(`timelineFilters[${activityTypeEntry.index}].value`, next.value);
                  }}
                />
              ))}
            </div>
          </fieldset>
        )}

        {filterEntries.length > 0 && (
          <section aria-labelledby="activity-widget-filters-heading" className="min-w-0 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-medium" id="activity-widget-filters-heading">
                {t("Dashboard.widgetEditor.filters.title")}
              </h4>

              <Badge variant="secondary">{activeFilterCount}</Badge>
            </div>

            <FilterAccordion
              baseId="timelineFilters"
              filterIndices={filterEntries.map(({ index }) => index)}
              filterableFields={filterableFields}
              filters={filterEntries.map(({ filter }) => filter)}
              value={expandedField ?? ""}
              variant="grouped"
              onFilterChange={(field) => {
                if (field === FilterFieldKey.connectedAccountId.toString()) onConnectedAccountChange?.();
              }}
              onValueChange={onExpandedFieldChange}
            />
          </section>
        )}

        {hiddenFilterEntries.length > 0 && (
          <section
            aria-labelledby="activity-widget-unavailable-filters-heading"
            className="space-y-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5"
          >
            <p className="text-xs text-warning" id="activity-widget-unavailable-filters-heading">
              {t("Dashboard.widgetEditor.filters.unavailable", {
                count: hiddenFilterEntries.length,
              })}
            </p>

            <div className="flex flex-wrap gap-1.5">
              {hiddenFilterEntries.map(({ filter, index }) => {
                const label = filterFieldLabel(filter.field);

                return (
                  <AppChip
                    key={`${filter.field}-${index}`}
                    endContent={
                      <button
                        aria-label={t("Dashboard.widgetEditor.filters.removeUnavailable", { field: label })}
                        className="ml-0.5 cursor-pointer opacity-60 transition-opacity hover:opacity-100"
                        disabled={form?.isDisabled}
                        type="button"
                        onClick={() => {
                          form?.onChange(`timelineFilters[${index}].operator`, undefined);
                          form?.onChange(`timelineFilters[${index}].value`, undefined);
                        }}
                      >
                        <XIcon aria-hidden className="size-3" />
                      </button>
                    }
                    variant="secondary"
                  >
                    <FilterChipValue
                      customColumns={undefined}
                      filter={filter}
                      label={label}
                      operator={t(`Common.filters.operators.${filter.operator}`)}
                    />
                  </AppChip>
                );
              })}
            </div>
          </section>
        )}
      </div>
    );
  },
);
