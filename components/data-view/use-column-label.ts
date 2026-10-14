"use client";

import type { CustomColumnDto } from "@/core/data-view/column-presentation.schema";

import { useTranslations } from "next-intl";

import { isCustomField } from "@/core/utils/custom-field";

function humanizeColumnId(columnId: string): string {
  const words = columnId
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/);

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function useColumnLabel() {
  const t = useTranslations();

  return (columnId: string) => t(`Common.table.columns.${columnId}`);
}

export function useCanonicalColumnLabel() {
  const t = useTranslations();

  return (columnId: string) => {
    if (t.has(`Common.table.columns.${columnId}`)) return t(`Common.table.columns.${columnId}`);
    if (t.has(`AuditLogModal.fields.${columnId}`)) return t(`AuditLogModal.fields.${columnId}`);
    return humanizeColumnId(columnId);
  };
}

export function useChangeFieldLabel() {
  const t = useTranslations();
  const canonicalLabel = useCanonicalColumnLabel();

  return (field: string, customColumns?: CustomColumnDto[]) => {
    if (isCustomField(field))
      return customColumns?.find((column) => column.id === field)?.label ?? t("Common.filters.unavailableValue");

    return canonicalLabel(field);
  };
}
