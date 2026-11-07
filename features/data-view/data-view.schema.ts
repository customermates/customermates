import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";
import {
  DataViewStateSchema,
  DataViewStateWireSchema,
  DataViewVisibilitySchema,
  ViewKeySchema,
} from "@/core/data-view/data-view-state.schema";
import { DATA_VIEW_NAME_MAX_LENGTH } from "@/core/data-view/data-view-limits";
import { CustomErrorCode } from "@/core/validation/validation.types";

import { SurfaceKeySchema as SurfaceKeyInputSchema } from "@/core/data-view/data-view-identity.schema";

const DataViewNameSchema = z.string().min(1).max(DATA_VIEW_NAME_MAX_LENGTH);
const DataViewPositionSchema = z.number().int().min(0);

const CreateDataViewSchema = z
  .object({
    surfaceKey: SurfaceKeyInputSchema,
    name: DataViewNameSchema,
    position: DataViewPositionSchema.optional(),
    state: DataViewStateSchema,
    copyOf: z.uuid().optional(),
  })
  .strict();

const UpdateDataViewSchema = z
  .object({
    id: z.uuid(),
    surfaceKey: SurfaceKeyInputSchema,
    name: DataViewNameSchema.optional(),
    position: DataViewPositionSchema.optional(),
    state: DataViewStateSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (
      data.name !== undefined ||
      data.position !== undefined ||
      (data.state !== undefined && Object.keys(data.state).length > 0)
    )
      return;
    ctx.addIssue({
      code: "custom",
      path: [],
      params: { error: CustomErrorCode.dataViewUpdateEmpty },
    });
  });

export const UpsertDataViewSchema = z.union([UpdateDataViewSchema, CreateDataViewSchema]);
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

export const SaveDataViewStateResultSchema = z.union([
  z
    .object({
      viewKey: z.literal(ALL_VIEW_KEY),
      state: DataViewStateWireSchema,
    })
    .strict(),
  z.object({ viewKey: z.uuid() }).strict(),
]);
export type SaveDataViewStateResult = Data<typeof SaveDataViewStateResultSchema>;

export const SelectDataViewResultSchema = z.object({
  activeViewKey: z.string(),
});
export type SelectDataViewResult = Data<typeof SelectDataViewResultSchema>;

export const DeleteDataViewResultSchema = z.object({ id: z.string(), trashBatchId: z.uuid() });
export type DeleteDataViewResult = Data<typeof DeleteDataViewResultSchema>;

export const DATA_VIEW_SHARE_ROLE_LIMIT = 50;

export const ShareDataViewSchema = z
  .object({
    id: z.uuid(),
    visibility: DataViewVisibilitySchema,
    roleIds: z.array(z.uuid()).max(DATA_VIEW_SHARE_ROLE_LIMIT).default([]),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.visibility !== "roles" || data.roleIds.length > 0) return;
    ctx.addIssue({ code: "custom", path: ["roleIds"], params: { error: CustomErrorCode.roleNotFound } });
  });
export type ShareDataViewData = Data<typeof ShareDataViewSchema>;

export const HideSharedDataViewSchema = z.object({ id: z.uuid(), hidden: z.boolean() }).strict();
export type HideSharedDataViewData = Data<typeof HideSharedDataViewSchema>;

export const HideSharedDataViewResultSchema = z.object({ id: z.string(), hidden: z.boolean() });
export type HideSharedDataViewResult = Data<typeof HideSharedDataViewResultSchema>;

export const DataViewShareOptionsSchema = z.object({
  roles: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type DataViewShareOptions = Data<typeof DataViewShareOptionsSchema>;
