import { z } from "zod";
import { EntityType, WidgetGroupByType, AggregationType } from "@/generated/prisma";

import { CHIP_COLORS } from "@/constants/chip-colors";

export const CompanyWidgetSchema = z.object({
  id: z.string(),
  name: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
});

export const CompanyWidgetsResultSchema = z.object({
  widgets: z.array(CompanyWidgetSchema),
});

export const WidgetDtoSchema = z.object({
  id: z.uuid(),
  userId: z.string(),
  companyId: z.string(),
  name: z.string(),
  entityType: z.enum(EntityType),
  entityFilters: z.array(z.any()),
  dealFilters: z.array(z.any()).optional(),
  displayOptions: z.any(),
  groupByType: z.enum(WidgetGroupByType),
  groupByCustomColumnId: z.string().nullable().optional(),
  aggregationType: z.enum(AggregationType),
  layout: z.any(),
  data: z.array(
    z.object({
      label: z.string(),
      value: z.number(),
      optionColor: z.enum(CHIP_COLORS).optional(),
    }),
  ),
  isTemplate: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
