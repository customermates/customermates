"use client";

import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";

import { useTranslations } from "next-intl";

import { useRootStore } from "@/core/stores/root-store.provider";
import { isCustomField } from "@/core/utils/custom-field";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import type { RecordPresetKey } from "@/features/records/record-navigation.schema";

export const RELATION_FILTER_PRESETS: Partial<Record<string, RecordPresetKey>> = {
  [FilterFieldKey.contactIds]: "contact",
  [FilterFieldKey.organizationIds]: "organization",
  [FilterFieldKey.dealIds]: "deal",
  [FilterFieldKey.serviceIds]: "service",
  [FilterFieldKey.taskIds]: "task",
};

export function useFilterFieldLabel() {
  const t = useTranslations();
  const { recordWorkspaceStore } = useRootStore();

  return (field: string, customColumns?: ColumnPresentation[]) => {
    const presentation = customColumns?.find((column) => column.id === field);
    if (presentation) return presentation.label;
    if (isCustomField(field)) return t("Common.filters.unavailableValue");

    const preset = RELATION_FILTER_PRESETS[field];
    if (preset) {
      return (
        recordWorkspaceStore.navigation?.types.find((type) => type.presetKey === preset)?.label ??
        t(`RecordModel.starterTypes.${preset}.singular`)
      );
    }

    return t(`Common.filters.fields.${field.replace(/\./g, "_")}`);
  };
}
