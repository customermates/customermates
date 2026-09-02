"use client";

import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";

import { useTranslations } from "next-intl";

import { isCustomField } from "@/core/utils/custom-field";

import { useColumnLabel } from "./use-column-label";

export function useChangeFieldLabel() {
  const t = useTranslations();
  const columnLabel = useColumnLabel();

  return (field: string, customColumns?: CustomColumnDto[]) => {
    if (isCustomField(field))
      return customColumns?.find((column) => column.id === field)?.label ?? t("Common.filters.unavailableValue");

    return columnLabel(field);
  };
}
