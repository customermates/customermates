"use client";

import type { DataViewGroup, DateBucket, GroupingResult } from "@/core/base/grouping/grouping.schema";

import { useTranslations } from "next-intl";

import { useHydratedIntlStore } from "@/core/stores/use-hydrated-intl-store";

export type GroupLabelResolver = (group: DataViewGroup) => string;

export function useDateBucketLabel(): (bucket: DateBucket) => string {
  const t = useTranslations();

  return (bucket) => t(`Common.dateBuckets.${bucket}`);
}

export function useGroupLabel(grouping: GroupingResult | undefined): GroupLabelResolver {
  const t = useTranslations();
  const intlStore = useHydratedIntlStore();
  const bucket = grouping?.grouping.bucket;

  return (group) => {
    if (group.isNoValue) return t("DataView.noValue");
    if (group.bucketRole === "later") return t("Common.dateBuckets.later");
    if (group.bucketRole === "earlier") return t("Common.dateBuckets.earlier");
    if (group.bucketStart) {
      return bucket === "month"
        ? intlStore.formatMonthYear(new Date(group.bucketStart))
        : intlStore.formatDescriptiveShortDate(new Date(group.bucketStart));
    }
    if (group.labelKind === "unavailable") return t("Common.inputs.unavailableSelection");
    if (group.labelKey) return t(group.labelKey);

    return group.label ?? t("Common.inputs.unavailableSelection");
  };
}

export function visibleGroups(
  grouping: GroupingResult | undefined,
  options?: { keepEmptyNoValue?: boolean },
): DataViewGroup[] {
  const groups = grouping?.groups ?? [];
  if (options?.keepEmptyNoValue) return groups;

  return groups.filter((group) => !group.isNoValue || group.count > 0);
}
