import type { FilterSelectItem } from "../x-filter-modal/use-filter-select-items";
import type { Filter } from "@/core/base/base-get.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { observer } from "mobx-react-lite";
import { useTranslations } from "next-intl";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Button } from "@heroui/button";
import { Spinner } from "@heroui/spinner";
import { z } from "zod";

import { isStandaloneOperator, isCustomField } from "../x-table-view/x-table-view.utils";
import { useXDataView } from "../x-data-view-container";
import { useFilterSelectItems } from "../x-filter-modal/use-filter-select-items";

import { XClickableChip } from "@/components/x-chip/x-clickable-chip";
import { XIcon } from "@/components/x-icon";
import { useRootStore } from "@/core/stores/root-store.provider";

function normalizeFilterValues(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : value != null ? [String(value)] : [];
}

function findLabelForValue(value: string, items: FilterSelectItem[]) {
  return items.find((it) => it.value === value || it.key === value)?.textValue ?? value;
}

type Props = {
  filter: Filter;
  customColumns?: CustomColumnDto[];
};

const FilterValue = observer(({ filter, customColumns }: Props) => {
  const { items, isLoading } = useFilterSelectItems(filter, customColumns);
  const { intlStore } = useRootStore();

  if (isStandaloneOperator(filter.operator)) return null;

  if (isLoading) return <Spinner className="[&>div]:h-3 [&>div]:w-3" size="sm" />;

  const values = normalizeFilterValues("value" in filter ? filter.value : undefined);

  const labels = values.map((value) => {
    const res = z.iso.datetime().safeParse(value);
    if (res.success) {
      const normalizedValue = res.data.endsWith("Z") ? res.data.slice(0, -1) : res.data;
      const parsedDate = new Date(normalizedValue);
      return intlStore.formatNumericalShortDate(parsedDate);
    }
    return findLabelForValue(value, items);
  });

  return <>{labels.join(", ")}</>;
});

export const XDataViewFiltersBar = observer(() => {
  const store = useXDataView();
  const t = useTranslations("Common");
  const { xTableFilterModalStore } = useRootStore();

  const hasActiveFilters = store.filters && store.filters.length > 0;
  const hasSavedPresets = store.savedFilterPresets && store.savedFilterPresets.length > 0;

  if (!hasActiveFilters && !hasSavedPresets) return null;

  function getLabel(filter: Filter): string {
    return isCustomField(filter.field)
      ? (store.customColumns?.find((col) => col.id === filter.field)?.label ?? "")
      : t(`filters.fields.${filter.field.replace(/\./g, "_")}`);
  }

  return (
    <div className="flex w-full flex-wrap gap-2 items-start justify-start">
      {hasActiveFilters ? (
        <>
          {store.filters?.map((filter) => (
            <XClickableChip
              key={filter.field}
              className="max-w-md"
              color="primary"
              endContent={
                <Button
                  isIconOnly
                  className="min-w-4 w-4 h-4"
                  color="primary"
                  size="sm"
                  variant="light"
                  onPress={() => store.removeFilter(filter)}
                >
                  <XIcon icon={XMarkIcon} size="sm" />
                </Button>
              }
              onClick={() => xTableFilterModalStore.openFor(store)}
            >
              <span>
                {`${getLabel(filter)} ${t(`filters.operators.${filter.operator}`)} `}

                {<FilterValue customColumns={store.customColumns} filter={filter} />}
              </span>
            </XClickableChip>
          ))}

          <XClickableChip variant="flat" onClick={() => store.changeFilterPreset(undefined)}>
            {t("filters.clearAll")}
          </XClickableChip>
        </>
      ) : (
        store.savedFilterPresets?.map((preset) => (
          <XClickableChip key={preset.id} onClick={() => store.changeFilterPreset(preset.id)}>
            {preset.name}
          </XClickableChip>
        ))
      )}
    </div>
  );
});
