"use client";

import type { FilterOperatorKey } from "@/core/base/base-query-builder";

import { useTranslations } from "next-intl";

export function useFilterOperatorLabel() {
  const t = useTranslations();

  return (operator: FilterOperatorKey) => t(`Common.filters.operators.${operator}`);
}
