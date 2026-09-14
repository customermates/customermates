import { z } from "zod";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { GroupingSchema } from "@/core/base/grouping/grouping.schema";
import { ViewMode } from "@/core/base/base-query-builder";
import { DataViewPageSizeSchema, SurfaceKeySchema, ViewKeySchema } from "@/core/data-view/data-view-state.schema";
import type { Data } from "@/core/validation/validation.utils";

export const AgentDataViewStateSchema = z
  .object({
    filters: z.array(FilterSchema).max(50).optional(),
    searchTerm: z.string().max(200).optional(),
    sortDescriptor: SortDescriptorSchema.nullable().optional(),
    pageSize: DataViewPageSizeSchema.optional(),
    viewMode: z.enum(ViewMode).optional(),
    grouping: GroupingSchema.nullable().optional(),
  })
  .strict();
export type AgentDataViewState = Data<typeof AgentDataViewStateSchema>;

const surface = { surfaceKey: SurfaceKeySchema };
export const ManageDataViewsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("surfaces") }).strict(),
  z.object({ action: z.literal("config"), ...surface }).strict(),
  z.object({ action: z.literal("list"), ...surface }).strict(),
  z
    .object({
      action: z.literal("create"),
      ...surface,
      name: z.string().trim().min(1).max(100),
      state: AgentDataViewStateSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("update"),
      ...surface,
      viewKey: ViewKeySchema,
      name: z.string().trim().min(1).max(100).optional(),
      state: AgentDataViewStateSchema.optional(),
    })
    .strict(),
  z.object({ action: z.literal("select"), ...surface, viewKey: ViewKeySchema }).strict(),
  z.object({ action: z.literal("delete"), ...surface, viewKey: z.uuid() }).strict(),
]);
export type ManageDataViewsData = Data<typeof ManageDataViewsSchema>;
