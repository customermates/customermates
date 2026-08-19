import type { DiagramDataPoint } from "../widget.schema";
import type { WidgetForCalculation } from "./widget-calculator.types";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getWidgetGroupingService, getWidgetDataFetcher, getCustomColumnRepo } from "@/core/di";

export class PrismaWidgetCalculatorRepo extends BaseRepository {
  async calculateWidgetData(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const { aggregationType } = widget;

    let data: DiagramDataPoint[];

    switch (aggregationType) {
      case AggregationType.count:
        data = await this.calculateCount(widget);
        break;
      case AggregationType.dealValue:
        data = await this.calculateDealValue(widget);
        break;
      case AggregationType.dealQuantity:
        data = await this.calculateDealQuantity(widget);
        break;
      case AggregationType.dealWeightedValue:
        data = await this.calculateDealWeightedValue(widget);
        break;
    }

    return [...data].sort((a, b) => b.value - a.value);
  }

  private async calculateCount(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const { entityType, entityFilters, groupByType, groupByCustomColumnId } = widget;

    if (groupByType === WidgetGroupByType.none) {
      return [
        {
          labelKind: "system",
          systemLabelKey: "total",
          value: await getWidgetDataFetcher().getEntityCount(entityType, entityFilters),
        },
      ];
    }

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId) {
      const customColumn = await getCustomColumnRepo().findById(groupByCustomColumnId);
      if (!customColumn || customColumn.type !== "singleSelect") return [];

      const counts = await getWidgetDataFetcher().countByCustomColumn(entityType, entityFilters, groupByCustomColumnId);
      return getWidgetGroupingService().buildCustomColumnPoints(counts, customColumn);
    }

    const entities = await getWidgetDataFetcher().getEntitiesForGrouping(entityType, entityFilters);
    return getWidgetGroupingService().groupEntitiesByEntityType(entities, entityType);
  }

  private async calculateDealValue(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    if (groupByType === WidgetGroupByType.none) {
      if (entityType === EntityType.service) {
        const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);
        const totalValue = deals.reduce(
          (sum, deal) => sum + (deal.services ?? []).reduce((s, sd) => s + sd.service.amount * sd.quantity, 0),
          0,
        );
        return [{ labelKind: "system", systemLabelKey: "total", value: totalValue }];
      }

      return [
        {
          labelKind: "system",
          systemLabelKey: "total",
          value: await getWidgetDataFetcher().sumDealField(widget, "totalValue"),
        },
      ];
    }

    const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return await getWidgetGroupingService().groupDealsByCustomColumn(widget, deals);

    return getWidgetGroupingService().groupDealsByEntityType(widget, deals);
  }

  private async calculateDealWeightedValue(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    if (entityType === EntityType.service || entityType === EntityType.task) return [];

    if (groupByType === WidgetGroupByType.none) {
      return [
        {
          labelKind: "system",
          systemLabelKey: "total",
          value: await getWidgetDataFetcher().sumDealField(widget, "weightedValue"),
        },
      ];
    }

    const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return await getWidgetGroupingService().groupDealsByCustomColumn(widget, deals);

    return getWidgetGroupingService().groupDealsByEntityType(widget, deals);
  }

  private async calculateDealQuantity(widget: WidgetForCalculation): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    if (entityType !== EntityType.service) return [];

    if (groupByType === WidgetGroupByType.none) {
      return [
        {
          labelKind: "system",
          systemLabelKey: "total",
          value: await getWidgetDataFetcher().sumDealField(widget, "totalQuantity"),
        },
      ];
    }

    const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);

    if (groupByType === WidgetGroupByType.service)
      return getWidgetGroupingService().groupDealsByEntityType(widget, deals);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return await getWidgetGroupingService().groupDealsByCustomColumn(widget, deals);

    return [];
  }
}
