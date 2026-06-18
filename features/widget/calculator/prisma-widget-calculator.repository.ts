import type { ExtendedWidget, DiagramDataPoint } from "../widget.types";

import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { getWidgetGroupingService, getWidgetDataFetcher, getCustomColumnRepo } from "@/core/di";

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

    return [...data].sort((a, b) => b.value - a.value);
  }

  private async calculateCount(widget: ExtendedWidget): Promise<DiagramDataPoint[]> {
    const { entityType, entityFilters, groupByType, groupByCustomColumnId } = widget;

    if (groupByType === WidgetGroupByType.none)
      return [{ label: "Total", value: await getWidgetDataFetcher().getEntityCount(entityType, entityFilters) }];

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId) {
      const customColumn = await getCustomColumnRepo().find(groupByCustomColumnId);
      if (!customColumn || customColumn.type !== "singleSelect") return [];

      const counts = await getWidgetDataFetcher().countByCustomColumn(entityType, entityFilters, groupByCustomColumnId);
      return getWidgetGroupingService().buildCustomColumnPoints(counts, customColumn);
    }

    const entities = await getWidgetDataFetcher().getEntitiesForGrouping(entityType, entityFilters);
    return getWidgetGroupingService().groupEntitiesByEntityType(entities, entityType);
  }

  private async calculateDealValue(widget: ExtendedWidget): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    if (groupByType === WidgetGroupByType.none) {
      if (entityType === EntityType.service) {
        // Services sum from the filtered services only (deal.services contains only the filtered services),
        // not deal.totalValue which includes every service in the deal.
        const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);
        const totalValue = deals.reduce(
          (sum, deal) => sum + (deal.services ?? []).reduce((s, sd) => s + sd.service.amount * sd.quantity, 0),
          0,
        );
        return [{ label: "Total", value: totalValue }];
      }

      return [{ label: "Total", value: await getWidgetDataFetcher().sumDealField(widget, "totalValue") }];
    }

    const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return await getWidgetGroupingService().groupDealsByCustomColumn(widget, deals);

    return getWidgetGroupingService().groupDealsByEntityType(widget, deals);
  }

  private async calculateDealQuantity(widget: ExtendedWidget): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    if (entityType !== EntityType.service) return [];

    if (groupByType === WidgetGroupByType.none)
      return [{ label: "Total", value: await getWidgetDataFetcher().sumDealField(widget, "totalQuantity") }];

    const deals = await getWidgetDataFetcher().getDealsForEntityType(widget);

    if (groupByType === WidgetGroupByType.service)
      return getWidgetGroupingService().groupDealsByEntityType(widget, deals);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return await getWidgetGroupingService().groupDealsByCustomColumn(widget, deals);

    return [];
  }
}
