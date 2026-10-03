"use client";

import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";

import { useTranslations } from "next-intl";

import { isCustomField } from "@/core/utils/custom-field";

import { useCanonicalColumnLabel } from "./use-column-label";

export function useChangeFieldLabel() {
  const t = useTranslations();
  const canonicalLabel = useCanonicalColumnLabel();

  return (field: string, customColumns?: CustomColumnDto[]) => {
    if (isCustomField(field))
      return customColumns?.find((column) => column.id === field)?.label ?? t("Common.filters.unavailableValue");

    return canonicalLabel(field);
  };
}
