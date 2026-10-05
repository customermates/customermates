"use client";

import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";

import { useTranslations } from "next-intl";

import { isCustomField } from "@/core/utils/custom-field";

export function useFilterFieldLabel() {
  const t = useTranslations();

  return (field: string, customColumns?: ColumnPresentation[]) => {
    const presentation = customColumns?.find((column) => column.id === field);
    if (presentation) return presentation.label;
    if (isCustomField(field)) return t("Common.filters.unavailableValue");

    return t(`Common.filters.fields.${field.replace(/\./g, "_")}`);
  };
}
