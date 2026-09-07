import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

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
    position: z.number().int().min(0).optional(),
    state: DataViewStateSchema,
  })
  .strict();
export type UpsertDataViewData = Data<typeof UpsertDataViewSchema>;

export const DeleteDataViewSchema = z.object({ id: z.uuid() }).strict();
export type DeleteDataViewData = Data<typeof DeleteDataViewSchema>;

export const SaveDataViewStateSchema = z
  .object({
    surfaceKey: SurfaceKeyInputSchema,
    viewKey: ViewKeySchema,
    state: DataViewStateSchema,
  })
  .strict();
export type SaveDataViewStateData = Data<typeof SaveDataViewStateSchema>;

export const SelectDataViewSchema = z.object({ surfaceKey: SurfaceKeyInputSchema, viewKey: ViewKeySchema }).strict();
export type SelectDataViewData = Data<typeof SelectDataViewSchema>;

export const SaveDataViewStateResultSchema = z.object({ viewKey: z.string() });
export type SaveDataViewStateResult = Data<typeof SaveDataViewStateResultSchema>;

export const SelectDataViewResultSchema = z.object({ activeViewKey: z.string() });
export type SelectDataViewResult = Data<typeof SelectDataViewResultSchema>;

export const DeleteDataViewResultSchema = z.object({ id: z.string() });
export type DeleteDataViewResult = Data<typeof DeleteDataViewResultSchema>;
