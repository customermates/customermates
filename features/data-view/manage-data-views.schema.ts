import type { Data } from "@/core/validation/validation.utils";

import { z } from "zod";

import { FilterSchema, SortDescriptorSchema } from "@/core/base/base-get.schema";
import { GroupingSchema } from "@/core/base/grouping/grouping.schema";
import { ViewMode } from "@/core/base/base-query-builder";
import { AiManageableDataViewSurfaceKeySchema } from "@/core/data-view/ai-manageable-surfaces";
import { DATA_VIEW_PATHS } from "@/core/data-view/data-view-paths";
import { DATA_VIEW_NAME_MAX_LENGTH } from "@/core/data-view/data-view-limits";
import {
  DataViewPageSizeSchema,
  DataViewStateWireSchema,
  ViewKeySchema,
} from "@/core/data-view/data-view-state.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";

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

export const DataViewConfigSectionSchema = z.enum(["overview", "filters", "sorting", "grouping"]);
export type DataViewConfigSection = z.infer<typeof DataViewConfigSectionSchema>;

export const ManageDataViewPageSchema = z.coerce.number().int().min(1).max(10_000);
export const ManageDataViewPageSizeSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(25)
  .transform((value): 5 | 10 | 25 => (value <= 5 ? 5 : value <= 10 ? 10 : 25));
export const ManageDataViewQuerySchema = z.string().trim().min(1).max(100).optional();

const surface = { surfaceKey: AiManageableDataViewSurfaceKeySchema };
const page = {
  page: ManageDataViewPageSchema.optional(),
  pageSize: ManageDataViewPageSizeSchema.optional(),
  query: ManageDataViewQuerySchema,
};

const UpdateDataViewSchema = z
  .object({
    action: z.literal("update"),
    ...surface,
    viewKey: ViewKeySchema,
    name: z.string().trim().min(1).max(DATA_VIEW_NAME_MAX_LENGTH).optional(),
    state: AgentDataViewStateSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.name !== undefined || (data.state !== undefined && Object.keys(data.state).length > 0)) return;
    ctx.addIssue({
      code: "custom",
      path: [],
      params: { error: CustomErrorCode.dataViewUpdateEmpty },
    });
  });

export const ManageDataViewsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("surfaces") }).strict(),
  z
    .object({
      action: z.literal("config"),
      ...surface,
      section: DataViewConfigSectionSchema.optional(),
      ...page,
    })
    .strict(),
  z.object({ action: z.literal("list"), ...surface, viewKey: ViewKeySchema.optional(), ...page }).strict(),
  z
    .object({
      action: z.literal("create"),
      ...surface,
      name: z.string().trim().min(1).max(DATA_VIEW_NAME_MAX_LENGTH),
      state: AgentDataViewStateSchema,
    })
    .strict(),
  UpdateDataViewSchema,
  z.object({ action: z.literal("select"), ...surface, viewKey: ViewKeySchema }).strict(),
  z.object({ action: z.literal("delete"), ...surface, viewKey: z.uuid() }).strict(),
]);
export type ManageDataViewsData = Data<typeof ManageDataViewsSchema>;

const ResultItemSchema = z.looseObject({
  id: z.string().optional(),
  surfaceKey: AiManageableDataViewSurfaceKeySchema.optional(),
  name: z.string().optional(),
  label: z.string().optional(),
  path: z.string().nullable().optional(),
  position: z.number().int().optional(),
  state: DataViewStateWireSchema.optional(),
  field: z.string().optional(),
  operators: z.array(z.string()).optional(),
});

export const ManageDataViewsResultSchema = z
  .looseObject({
    action: z.enum(["surfaces", "config", "list", "create", "update", "select", "delete"]),
    surfaceKey: AiManageableDataViewSurfaceKeySchema.optional(),
    label: z.string().optional(),
    path: z.string().nullable().optional(),
    entityType: z.string().optional(),
    section: DataViewConfigSectionSchema.optional(),
    total: z.number().int().min(0).optional(),
    page: z.number().int().min(1).optional(),
    pageSize: z.number().int().min(1).optional(),
    totalPages: z.number().int().min(1).optional(),
    items: z.array(ResultItemSchema).optional(),
    totals: z.record(z.string(), z.number().int().min(0)).optional(),
    supportsSearch: z.boolean().optional(),
    viewModes: z.array(z.enum(ViewMode)).optional(),
    writableStateFields: z.array(z.string()).optional(),
    activeViewKey: z.string().nullable().optional(),
    allState: DataViewStateWireSchema.optional(),
    viewKey: ViewKeySchema.optional(),
    id: z.string().optional(),
    name: z.string().optional(),
    position: z.number().int().optional(),
    state: DataViewStateWireSchema.optional(),
    link: z.string().nullable().optional(),
    selected: z.boolean().optional(),
    deleted: z.boolean().optional(),
  })
  .superRefine((result, ctx) => {
    const requireField = (field: "surfaceKey" | "viewKey" | "link") => {
      if (result[field] !== undefined) return;
      ctx.addIssue({ code: "custom", path: [field], message: `${field} is required for ${result.action}` });
    };

    if (["create", "update", "select"].includes(result.action)) {
      requireField("surfaceKey");
      requireField("viewKey");
      requireField("link");
      if (result.surfaceKey && result.viewKey && result.link !== undefined) {
        const path = DATA_VIEW_PATHS[result.surfaceKey];
        const expectedLink = path ? `${path}?view=${result.viewKey}` : null;
        if (result.link !== expectedLink)
          ctx.addIssue({ code: "custom", path: ["link"], message: `link must match ${result.surfaceKey}` });
      }
    }
    if (result.action === "create" || result.action === "select") {
      if (result.selected !== true)
        ctx.addIssue({ code: "custom", path: ["selected"], message: `selected must be true for ${result.action}` });
    }
    if (result.action === "delete") {
      requireField("surfaceKey");
      requireField("viewKey");
      if (result.deleted !== true)
        ctx.addIssue({ code: "custom", path: ["deleted"], message: "deleted must be true for delete" });
    }
  })
  .describe(
    "surfaces, config and list return total before paged items; mutations return their action, surfaceKey, viewKey and resulting state/link or selected/deleted flag.",
  );
export type ManageDataViewsResult = Data<typeof ManageDataViewsResultSchema>;
