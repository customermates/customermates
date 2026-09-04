import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { DataViewVisibility } from "@/generated/prisma";
import { DATA_VIEW_SURFACE_KEYS } from "@/core/data-view/data-view-keys";
import { DataViewStateSchema, ViewKeySchema } from "@/core/data-view/data-view-state.schema";

export const SurfaceKeyInputSchema = z.enum(DATA_VIEW_SURFACE_KEYS);

export const GetDataViewsSchema = z.object({ surfaceKey: SurfaceKeyInputSchema }).strict();
export type GetDataViewsData = Data<typeof GetDataViewsSchema>;

export const UpsertDataViewSchema = z
  .object({
    id: z.uuid().optional(),
    surfaceKey: SurfaceKeyInputSchema,
    name: z.string().min(1).max(100),
    visibility: z.enum(DataViewVisibility).optional(),
    position: z.number().int().min(0).optional(),
    state: DataViewStateSchema,
    fromViewKey: ViewKeySchema.optional(),
    commitFromOverride: z.boolean().optional(),
  })
  .strict();
export type UpsertDataViewData = Data<typeof UpsertDataViewSchema>;

export const DeleteDataViewSchema = z.object({ id: z.uuid() }).strict();
export type DeleteDataViewData = Data<typeof DeleteDataViewSchema>;

export const ApplyDataViewOverrideSchema = z
  .object({
    surfaceKey: SurfaceKeyInputSchema,
    viewKey: ViewKeySchema,
    mode: z.enum(["save", "reset"]),
    state: DataViewStateSchema.optional(),
  })
  .strict();
export type ApplyDataViewOverrideData = Data<typeof ApplyDataViewOverrideSchema>;

export const SelectDataViewSchema = z.object({ surfaceKey: SurfaceKeyInputSchema, viewKey: ViewKeySchema }).strict();
export type SelectDataViewData = Data<typeof SelectDataViewSchema>;

export const DataViewOverrideResultSchema = z.object({ hasOverride: z.boolean() });
export type DataViewOverrideResult = Data<typeof DataViewOverrideResultSchema>;

export const SelectDataViewResultSchema = z.object({ activeViewKey: z.string() });
export type SelectDataViewResult = Data<typeof SelectDataViewResultSchema>;

export const DeleteDataViewResultSchema = z.object({ id: z.string() });
export type DeleteDataViewResult = Data<typeof DeleteDataViewResultSchema>;
