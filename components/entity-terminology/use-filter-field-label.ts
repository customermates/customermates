"use client";

import type { ColumnPresentation } from "@/core/data-view/column-presentation.schema";

import { useTranslations } from "next-intl";

import { isCustomField } from "@/core/utils/custom-field";
import { FILTER_FIELD_TERMINOLOGY } from "@/features/entity-terminology/entity-terminology.constants";

import { useEntityTerminology } from "./use-entity-terminology";

export function useFilterFieldLabel() {
  const t = useTranslations();
  const { term } = useEntityTerminology();

  return (field: string, customColumns?: ColumnPresentation[]) => {
    const presentation = customColumns?.find((column) => column.id === field);
    if (presentation) return presentation.label;
    if (isCustomField(field))
      return customColumns?.find((column) => column.id === field)?.label ?? t("Common.filters.unavailableValue");

    const terminologyField = FILTER_FIELD_TERMINOLOGY[field];

    return terminologyField
      ? term(terminologyField.entityType, terminologyField.form)
      : t(`Common.filters.fields.${field.replace(/\./g, "_")}`);
  };
}
