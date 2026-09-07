"use client";

import type { GroupableFieldDto } from "@/core/base/grouping/groupable-field";

import { useTranslations } from "next-intl";

import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useFilterFieldLabel } from "@/components/entity-terminology/use-filter-field-label";

import { useDateBucketLabel } from "./group-label";

export function useGroupableFieldLabel(): (field: GroupableFieldDto) => string {
  const t = useTranslations();
  const columnLabel = useColumnLabel();
  const filterFieldLabel = useFilterFieldLabel();
  const dateBucketLabel = useDateBucketLabel();

  function fieldName(field: GroupableFieldDto): string {
    if (field.label) return field.label;
    if (field.kind === "relation" || field.kind === "dateBucket") return filterFieldLabel(field.grouping.field);

    return field.labelKey ? t(field.labelKey) : columnLabel(field.grouping.field);
  }

  return (field) => {
    const base = fieldName(field);

    return field.bucket ? `${base} \u00b7 ${dateBucketLabel(field.bucket)}` : base;
  };
}
