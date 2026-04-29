import type { Data } from "../validation/validation.utils";

import { z } from "zod";
import { Prisma } from "@/generated/prisma";

import { FilterOperatorKey } from "./base-query-builder";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { CustomColumnDtoSchema } from "@/features/custom-column/custom-column.schema";

export const FilterSchema = z.discriminatedUnion("operator", [
  z
    .object({
      field: z.string(),
      operator: z.union([
        z.literal(FilterOperatorKey.equals).meta({ title: "equals" }),
        z.literal(FilterOperatorKey.contains).meta({ title: "contains" }),
        z.literal(FilterOperatorKey.gt).meta({ title: "gt" }),
        z.literal(FilterOperatorKey.gte).meta({ title: "gte" }),
        z.literal(FilterOperatorKey.lt).meta({ title: "lt" }),
        z.literal(FilterOperatorKey.lte).meta({ title: "lte" }),
      ]),
      value: z.string(),
    })
    .meta({ title: "Single value filter" }),
  z
    .object({
      field: z.string(),
      operator: z.union([
        z.literal(FilterOperatorKey.in).meta({ title: "in" }),
        z.literal(FilterOperatorKey.notIn).meta({ title: "notIn" }),
        z.literal(FilterOperatorKey.between).meta({ title: "between" }),
        z.literal(FilterOperatorKey.hasNone).meta({ title: "hasNone" }),
        z.literal(FilterOperatorKey.hasSome).meta({ title: "hasSome" }),
      ]),
      value: z.array(z.string()),
    })
    .superRefine((data, ctx) => {
      if (data.operator === FilterOperatorKey.between && data.value.length !== 2) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.filterBetweenInvalidArrayLength },
          path: ["value"],
        });
      }
    })
    .meta({ title: "Multi value filter" }),
  z
    .object({
      field: z.string(),
      operator: z.union([
        z.literal(FilterOperatorKey.isNull).meta({ title: "isNull" }),
        z.literal(FilterOperatorKey.isNotNull).meta({ title: "isNotNull" }),
      ]),
    })
    .meta({ title: "Standalone filter" }),
  z
    .object({
      field: z.string(),
      operator: z.literal(FilterOperatorKey.inLastDays).meta({ title: "inLastDays" }),
      value: z.coerce.number().int().positive(),
    })
    .meta({ title: "Relative window filter" }),
]);
export type Filter = Data<typeof FilterSchema>;

export const SortDescriptorSchema = z.object({
  field: z.string(),
  direction: z.enum(Prisma.SortOrder),
});
export type SortDescriptor = Data<typeof SortDescriptorSchema>;

export const PaginationRequestSchema = z.object({
  page: z.number().min(1),
  pageSize: z.union([
    z.literal(5).meta({ title: "5" }),
    z.literal(10).meta({ title: "10" }),
    z.literal(25).meta({ title: "25" }),
    z.literal(100).meta({ title: "100" }),
  ]),
});
export type PaginationRequest = Data<typeof PaginationRequestSchema>;

export const PaginationResponseSchema = PaginationRequestSchema.extend({
  totalPages: z.number().positive(),
  total: z.number().positive(),
});
export type PaginationResponse = Data<typeof PaginationResponseSchema>;

export const SavedFilterPresetSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  filters: z.array(FilterSchema),
});

export const FilterableFieldSchema = z.object({
  field: z.string(),
  operators: z.array(z.enum(FilterOperatorKey)),
  label: z.string().optional(),
});
export type FilterableField = Data<typeof FilterableFieldSchema>;

export const SortableFieldDescriptorSchema = z.object({
  field: z.string(),
  label: z.string().optional(),
  columnType: z.string().optional(),
});
export type SortableFieldDescriptor = Data<typeof SortableFieldDescriptorSchema>;

export const GetQueryParamsApiSchema = z.object({
  filters: z.array(FilterSchema).optional(),
  searchTerm: z.string().optional(),
  sortDescriptor: SortDescriptorSchema.optional(),
  pagination: PaginationRequestSchema.optional(),
});
export type GetQueryParamsApi = Data<typeof GetQueryParamsApiSchema>;

export const GetQueryParamsSchema = GetQueryParamsApiSchema.extend({
  p13nId: z.string().optional(),
});
export type GetQueryParams = Data<typeof GetQueryParamsSchema>;

export const GetConfigurationSchema = z.object({
  customColumns: z.array(CustomColumnDtoSchema),
  filterableFields: z.array(FilterableFieldSchema),
  sortableFields: z.array(SortableFieldDescriptorSchema),
});

export const GetResultSchema = z.object({
  customColumns: z.array(CustomColumnDtoSchema).optional(),
  filters: z.array(FilterSchema).optional(),
  searchTerm: z.string().optional(),
  sortDescriptor: SortDescriptorSchema.optional(),
  pagination: PaginationRequestSchema.extend({
    totalPages: z.number().positive().optional(),
    total: z.number().positive().optional(),
  }).optional(),
  filterableFields: z.array(FilterableFieldSchema).optional(),
  savedFilterPresets: z.array(SavedFilterPresetSchema).optional(),
});

export function createGetResultSchema<T extends z.ZodSchema>(itemSchema: T) {
  return z.object({
    p13nId: z.string().optional(),
    items: z.array(itemSchema),
    customColumns: z.array(z.any()).optional(),
    filters: z.array(z.any()).optional(),
    searchTerm: z.string().optional().nullable(),
    sortDescriptor: z.any().optional(),
    pagination: z
      .object({
        page: z.number(),
        pageSize: z.number(),
        totalPages: z.number(),
        total: z.number(),
      })
      .optional(),
    filterableFields: z.array(z.any()).optional(),
    columnOrder: z.array(z.string()).optional(),
    columnWidths: z.record(z.string(), z.number()).optional(),
    hiddenColumns: z.array(z.string()).optional(),
    savedFilterPresets: z.array(z.any()).optional(),
    viewMode: z.string().optional(),
    groupingColumnId: z.string().optional(),
  });
}
