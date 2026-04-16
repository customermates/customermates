import type { ExtendedWidget } from "./widget.types";
import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType } from "@/generated/prisma";

import { ChartColor, DisplayType } from "@/features/widget/widget.types";
import { WidgetDtoSchema } from "./widget.schema";
import { Validate } from "@/core/decorators/validate.decorator";
import { ValidateOutput } from "@/core/decorators/validate-output.decorator";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { type Validated } from "@/core/validation/validation.utils";
import { BaseInteractor } from "@/core/base/base-interactor";
import { TentantInteractor } from "@/core/decorators/tenant-interactor.decorator";
import { FilterSchema } from "@/core/base/base-get.schema";

const DisplayOptionsSchema = z
  .object({
    barColors: z.array(z.enum(ChartColor)).optional(),
    displayType: z.enum(DisplayType),
    reverseXAxis: z.boolean().optional(),
    reverseYAxis: z.boolean().optional(),
  })
  .optional();

export type DisplayOptions = Data<typeof DisplayOptionsSchema>;

const Schema = z
  .object({
    id: z.uuid().optional(),
    name: z.string().min(1),
    entityType: z.enum(EntityType),
    entityFilters: z.array(FilterSchema).optional(),
    dealFilters: z.array(FilterSchema).optional(),
    displayOptions: DisplayOptionsSchema,
    groupByType: z.enum(WidgetGroupByType),
    groupByCustomColumnId: z.uuid().optional(),
    aggregationType: z.enum(AggregationType),
    isTemplate: z.boolean(),
  })
  .superRefine((data, ctx) => {
    if (data.groupByType === WidgetGroupByType.customColumn && !data.groupByCustomColumnId) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetGroupByCustomColumnIdRequired },
        path: ["groupByCustomColumnId"],
      });
    }

    if (data.aggregationType === AggregationType.dealQuantity && data.entityType !== EntityType.service) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetDealQuantityOnlyForService },
        path: ["aggregationType"],
      });
    }

    if (
      data.entityType === EntityType.task &&
      (data.aggregationType === AggregationType.dealValue || data.aggregationType === AggregationType.dealQuantity)
    ) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetDealAggregationNotAllowedForTask },
        path: ["aggregationType"],
      });
    }

    const isGroupingByEntityTypeItself =
      data.groupByType &&
      ((data.entityType === EntityType.contact && data.groupByType === WidgetGroupByType.contact) ||
        (data.entityType === EntityType.organization && data.groupByType === WidgetGroupByType.organization) ||
        (data.entityType === EntityType.deal && data.groupByType === WidgetGroupByType.deal) ||
        (data.entityType === EntityType.service && data.groupByType === WidgetGroupByType.service));

    if (isGroupingByEntityTypeItself && data.aggregationType === AggregationType.count) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetGroupByEntityTypeNotAllowedForCount },
        path: ["groupByType"],
      });
    }

    if (
      data.groupByType &&
      data.groupByType !== WidgetGroupByType.customColumn &&
      data.groupByType !== WidgetGroupByType.none
    ) {
      const entityTypeToGroupByType: Record<EntityType, WidgetGroupByType | undefined> = {
        [EntityType.contact]: WidgetGroupByType.contact,
        [EntityType.organization]: WidgetGroupByType.organization,
        [EntityType.deal]: WidgetGroupByType.deal,
        [EntityType.service]: WidgetGroupByType.service,
        [EntityType.task]: undefined,
      };

      if (data.entityType === EntityType.task) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.widgetTaskCanOnlyGroupByCustomColumn },
          path: ["groupByType"],
        });
      } else if (data.groupByType !== entityTypeToGroupByType[data.entityType]) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.widgetGroupByTypeMustMatchEntityType },
          path: ["groupByType"],
        });
      }
    }

    if (data.entityType === EntityType.deal && data.dealFilters && data.dealFilters.length > 0) {
      ctx.addIssue({
        code: "custom",
        params: { error: CustomErrorCode.widgetDealFiltersNotAllowedForDealEntityType },
        path: ["dealFilters"],
      });
    }
  });

export type UpsertWidgetData = Data<typeof Schema>;

export abstract class UpsertWidgetRepo {
  abstract upsertWidget(data: { data: UpsertWidgetData }): Promise<ExtendedWidget>;
}

@TentantInteractor()
export class UpsertWidgetInteractor extends BaseInteractor<UpsertWidgetData, ExtendedWidget> {
  constructor(private repo: UpsertWidgetRepo) {
    super();
  }

  @Validate(Schema)
  @ValidateOutput(WidgetDtoSchema)
  async invoke(data: UpsertWidgetData): Validated<ExtendedWidget> {
    return { ok: true as const, data: await this.repo.upsertWidget({ data }) };
  }
}
