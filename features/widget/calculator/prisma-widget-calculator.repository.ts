import type { ExtendedWidget, DiagramDataPoint } from "../widget.types";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getWidgetGroupingService, getWidgetDataFetcher } from "@/core/app-di";

export class PrismaWidgetCalculatorRepo extends BaseRepository {
  async calculateWidgetData(widget: ExtendedWidget): Promise<DiagramDataPoint[]> {
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
    }

    return this.sortData(data);
  }

  private sortData(data: DiagramDataPoint[]): DiagramDataPoint[] {
    return [...data].sort((a, b) => b.value - a.value);
  }

  private async calculateCount(widget: ExtendedWidget): Promise<DiagramDataPoint[]> {
    const { entityType, entityFilters, groupByType, groupByCustomColumnId } = widget;

    if (groupByType === WidgetGroupByType.none)
      return [{ label: "Total", value: await getWidgetDataFetcher().getEntityCount(entityType, entityFilters) }];

    const entities = await getWidgetDataFetcher().getEntitiesForGrouping(entityType, entityFilters);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return getWidgetGroupingService().groupEntitiesByCustomColumn(entityType, entities, groupByCustomColumnId);

    return getWidgetGroupingService().groupEntitiesByEntityType(entities, entityType);
  }

  private async calculateDealValue(widget: ExtendedWidget): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);

    if (groupByType === WidgetGroupByType.none) {
      const totalValue =
        entityType === EntityType.service
          ? // For services, we need to calculate from filtered services only (deal.services contains only the filtered services),
            // not from deal.totalValue which includes all services in the deal
            deals.reduce(
              (sum, deal) => sum + (deal.services ?? []).reduce((s, sd) => s + sd.service.amount * sd.quantity, 0),
              0,
            )
          : // For other entity types, we can use deal.totalValue which includes all services in each deal
            deals.reduce((sum, deal) => sum + deal.totalValue, 0);

      return [{ label: "Total", value: totalValue }];
    }

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return await getWidgetGroupingService().groupDealsByCustomColumn(widget, deals);

    return getWidgetGroupingService().groupDealsByEntityType(widget, deals);
  }

  private async calculateDealQuantity(widget: ExtendedWidget): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    if (entityType !== EntityType.service) return [];

    const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);

    if (groupByType === WidgetGroupByType.none)
      return [{ label: "Total", value: deals.reduce((sum, deal) => sum + deal.totalQuantity, 0) }];

    if (groupByType === WidgetGroupByType.service)
      return getWidgetGroupingService().groupDealsByEntityType(widget, deals);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return await getWidgetGroupingService().groupDealsByCustomColumn(widget, deals);

    return [];
  }
}
