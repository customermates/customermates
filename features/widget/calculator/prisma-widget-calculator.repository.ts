import { AggregationType, EntityType, WidgetGroupByType } from "@/generated/prisma";

import { ExtendedWidget, DiagramDataPoint } from "../widget.types";

import { WidgetGroupingService } from "./widget-grouping.service";
import { WidgetDataFetcher } from "./widget-data-fetcher.service";

import { BaseRepository } from "@/core/base/base-repository";
import { Repository } from "@/core/decorators/repository.decorator";
import { di } from "@/core/dependency-injection/container";

@Repository
export class PrismaWidgetCalculatorRepo extends BaseRepository {
  private get groupingService() {
    return di.get(WidgetGroupingService);
  }

  private get dataFetcher(): WidgetDataFetcher {
    return di.get(WidgetDataFetcher);
  }

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
      return [{ label: "Total", value: await this.dataFetcher.getEntityCount(entityType, entityFilters) }];

    const entities = await this.dataFetcher.getEntitiesForGrouping(entityType, entityFilters);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return this.groupingService.groupEntitiesByCustomColumn(entityType, entities, groupByCustomColumnId);

    return this.groupingService.groupEntitiesByEntityType(entities, entityType);
  }

  private async calculateDealValue(widget: ExtendedWidget): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    const deals = await this.dataFetcher.getDealsForEntityType(widget);

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
      return await this.groupingService.groupDealsByCustomColumn(widget, deals);

    return this.groupingService.groupDealsByEntityType(widget, deals);
  }

  private async calculateDealQuantity(widget: ExtendedWidget): Promise<DiagramDataPoint[]> {
    const { entityType, groupByType, groupByCustomColumnId } = widget;

    if (entityType !== EntityType.service) return [];

    const deals = await this.dataFetcher.getDealsForEntityType(widget);

    if (groupByType === WidgetGroupByType.none)
      return [{ label: "Total", value: deals.reduce((sum, deal) => sum + deal.totalQuantity, 0) }];

    if (groupByType === WidgetGroupByType.service) return this.groupingService.groupDealsByEntityType(widget, deals);

    if (groupByType === WidgetGroupByType.customColumn && groupByCustomColumnId)
      return await this.groupingService.groupDealsByCustomColumn(widget, deals);

    return [];
  }
}
