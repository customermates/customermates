import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { ViewMode } from "@/core/base/base-query-builder";
import { DataViewVisibility } from "@/generated/prisma";

import { ALL_VIEW_KEY, DATA_VIEW_SURFACE_KEYS } from "./data-view-keys";

export const DATA_VIEW_PAGE_SIZES = [5, 10, 25, 100] as const;

export const DataViewPageSizeSchema = z.union([z.literal(5), z.literal(10), z.literal(25), z.literal(100)]);

function dropUndefinedKeys<T extends Record<string, unknown>>(value: T): T {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) if (entry !== undefined) next[key] = entry;
  return next as T;
}

const RawDataViewStateSchema = z
  .object({
    filters: z.array(FilterSchema),
    searchTerm: z.string().max(200),
    sortDescriptor: SortDescriptorSchema.nullable(),
    pageSize: DataViewPageSizeSchema,
    viewMode: z.enum(ViewMode),
    groupingColumnId: z.uuid().nullable(),
    columnOrder: z.array(z.string()),
    columnWidths: z.record(z.string(), z.number()),
    hiddenColumns: z.array(z.string()),
  })
  .partial()
  .strict();

export const DataViewStateSchema = RawDataViewStateSchema.transform(dropUndefinedKeys);

export type DataViewState = Data<typeof DataViewStateSchema>;

export const DATA_VIEW_STATE_FIELDS = [
  "filters",
  "searchTerm",
  "sortDescriptor",
  "pageSize",
  "viewMode",
  "groupingColumnId",
  "columnOrder",
  "columnWidths",
  "hiddenColumns",
] as const satisfies readonly (keyof DataViewState)[];

export const ViewKeySchema = z.union([z.literal(ALL_VIEW_KEY), z.uuid()]);
export type ViewKey = Data<typeof ViewKeySchema>;

export const SurfaceKeySchema = z.enum(DATA_VIEW_SURFACE_KEYS);

export const DataViewChipDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  visibility: z.enum(DataViewVisibility),
  position: z.number().int(),
  isOwner: z.boolean(),
  ownerName: z.string().optional(),
  state: DataViewStateSchema,
});
export type DataViewChipDto = Data<typeof DataViewChipDtoSchema>;

export const DataViewDtoSchema = DataViewChipDtoSchema.extend({
  surfaceKey: SurfaceKeySchema,
});
export type DataViewDto = Data<typeof DataViewDtoSchema>;
