"use client";

import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";

import { useTranslations } from "next-intl";

import { isCustomField } from "@/core/utils/custom-field";

export function useFilterFieldLabel() {
  const t = useTranslations();

  return (field: string, customColumns?: ColumnPresentation[]) => {
    if (field === RECORD_CONTRIBUTION_FILTER) return t("RecordWidgets.contributingRecords");
    const presentation = customColumns?.find((column) => column.id === field);
    if (presentation) return presentation.label;
    if (isCustomField(field)) return t("Common.filters.unavailableValue");

    return t(`Common.filters.fields.${field.replace(/\./g, "_")}`);
  };
}
import { RECORD_CONTRIBUTION_FILTER } from "@/features/records/record-contribution-link";
