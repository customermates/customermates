"use client";

import { useTranslations } from "next-intl";
import { AggregationType, EntityType } from "@/generated/prisma";

import { useEntityTerminology } from "@/components/entity-terminology/use-entity-terminology";

export function useAggregationTypeLabel(): (aggregationType: AggregationType, entityType: EntityType) => string {
  const t = useTranslations();
  const { plural, singular } = useEntityTerminology();

  return (aggregationType, entityType) => {
    switch (aggregationType) {
      case AggregationType.count:
        return t("Dashboard.aggregationTypes.count", { entities: plural(entityType) });
      case AggregationType.dealValue:
        return entityType === EntityType.deal
          ? t("Dashboard.aggregationTypes.dealValue", { deal: singular(EntityType.deal) })
          : t("Dashboard.aggregationTypes.dealValueRelated", {
              deal: singular(EntityType.deal),
              entity: singular(entityType),
            });
      case AggregationType.dealQuantity:
        return t("Dashboard.aggregationTypes.dealQuantity", {
          deals: plural(EntityType.deal),
          services: plural(EntityType.service),
        });
      case AggregationType.dealWeightedValue:
        return entityType === EntityType.deal
          ? t("Dashboard.aggregationTypes.dealWeightedValue", { deal: singular(EntityType.deal) })
          : t("Dashboard.aggregationTypes.dealWeightedValueRelated", {
              deal: singular(EntityType.deal),
              entity: singular(entityType),
            });
    }
  };
}
