"use client";

import { useLocale, useTranslations } from "next-intl";
import { EntityType } from "@/generated/prisma";

import { useColumnLabel } from "@/components/entity-terminology/use-column-label";
import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";
import { terminologyLabelForSentence } from "@/features/entity-terminology/entity-terminology-label.utils";

type WeightedValueBreakdown = {
  percent: number;
  stage: string;
} | null;

export function useDealComputedFieldHelp(weightedValueBreakdown: WeightedValueBreakdown) {
  const locale = useLocale();
  const t = useTranslations();
  const columnLabel = useColumnLabel();
  const { plural, singular } = useEntityTerminology();
  const services = terminologyLabelForSentence(plural(EntityType.service), locale);
  const service = terminologyLabelForSentence(singular(EntityType.service), locale);
  const sharedValues = {
    company: t("UserAvatar.company"),
    dealValue: columnLabel("totalValue"),
    services,
  };

  return {
    dealValue: t("EntityDetail.computedFieldHelp.dealValue", { services }),
    serviceLineValue: t("EntityDetail.computedFieldHelp.serviceLineValue", { service }),
    serviceQuantity: t("EntityDetail.computedFieldHelp.serviceQuantity", { services }),
    weightedValue: weightedValueBreakdown
      ? t("EntityDetail.computedFieldHelp.weightedValue", {
          ...sharedValues,
          percent: weightedValueBreakdown.percent,
          stage: weightedValueBreakdown.stage,
        })
      : t("EntityDetail.computedFieldHelp.weightedValueUnconfigured", sharedValues),
  };
}
