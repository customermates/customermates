import type { $ZodIssue, $ZodRawIssue } from "zod/v4/core";
import type { McpTool } from "./mcp-tool";

import { z } from "zod";

import { getManageDataViewsInteractor } from "@/core/di";
import { DATA_VIEW_STATE_FIELDS } from "@/core/data-view/data-view-state.schema";
import { AiManageableDataViewSurfaceKeySchema } from "@/core/data-view/ai-manageable-surfaces";
import { DATA_VIEW_NAME_MAX_LENGTH } from "@/core/data-view/data-view-limits";
import { ViewKeySchema } from "@/core/data-view/data-view-state.schema";
import { getZodParseContext } from "@/core/validation/zod-error-map-server";
import {
  AgentDataViewStateSchema,
  DataViewConfigSectionSchema,
  ManageDataViewPageSchema,
  ManageDataViewPageSizeSchema,
  ManageDataViewQuerySchema,
  ManageDataViewsResultSchema,
  ManageDataViewsSchema,
} from "@/features/data-view/manage-data-views.schema";

import { mcpInteractorFailure, mcpValidationFailure } from "./mcp-tool";
import { toonResult } from "./utils";

function withoutRenderedMessage(issue: $ZodIssue): $ZodRawIssue {
  const raw: Record<string, unknown> = { ...issue };
  delete raw.message;
  return raw as $ZodRawIssue;
}

export const ManageDataViewsToolSchema = z
  .object({
    action: z
      .enum(["surfaces", "config", "list", "create", "update", "select", "delete", "reset"])
      .describe(
        "surfaces discovers supported pages; config reads one capability section; list pages view summaries or reads one exact view; create/update/select/delete change personal views.",
      ),
    surfaceKey: AiManageableDataViewSurfaceKeySchema.optional().describe(
      "Required for every action except surfaces. Operator-console surfaces are intentionally unavailable.",
    ),
    viewKey: ViewKeySchema.optional().describe(
      "list: optional exact view whose state is needed. Required for update/select/delete. __all__ cannot be renamed or deleted.",
    ),
    section: DataViewConfigSectionSchema.optional().describe(
      "config only. Defaults to overview; use filters, sorting, grouping or appearance for paged field metadata.",
    ),
    page: ManageDataViewPageSchema.optional().describe(
      "Config and summary-list only. 1-indexed page; default 1. Ignored when list has an exact viewKey.",
    ),
    pageSize: ManageDataViewPageSizeSchema.optional().describe(
      "Config and summary-list only. Results per page, 1-25, served exactly; default 10. Ignored for an exact viewKey.",
    ),
    query: ManageDataViewQuerySchema.describe(
      "Config and summary-list only. Narrow by an exact or partial field id, label, view id or view name after a truncated or broad result. Ignored for an exact viewKey.",
    ),
    name: z.string().trim().min(1).max(DATA_VIEW_NAME_MAX_LENGTH).optional().describe("Required on create."),
    fields: z
      .array(z.enum(DATA_VIEW_STATE_FIELDS))
      .min(1)
      .max(DATA_VIEW_STATE_FIELDS.length)
      .optional()
      .describe(
        "reset only: remove personal overrides for these keys, restoring shared type defaults. Only dynamic record surfaces support reset.",
      ),
    state: AgentDataViewStateSchema.optional().describe(
      "Call config first. Create: initial state. Update: call list immediately before every update with the exact viewKey; include only keys the user asked to change. Keys equal to the listed value are no-ops. Arrays replace. Never copy old conversation/full state.",
    ),
  })
  .strict()
  .superRefine((data, ctx) => {
    const parsed = ManageDataViewsSchema.safeParse(data);
    if (parsed.success) return;
    for (const issue of parsed.error.issues) ctx.addIssue(withoutRenderedMessage(issue));
  });

export const manageDataViewsTool = {
  name: "manage_data_views",
  title: "Manage personal saved views",
  description:
    "Manage personal saved views on supported workspace pages; operator-console views are excluded. " +
    "Discover authorized pages with surfaces, including customer-defined record types; dynamic surface keys contain stable type IDs. Select filters use stable option IDs from config, not editable labels. Start config at overview, then page filters/sorting/grouping/appearance; narrow query/page after truncation. " +
    "List returns paged summaries; pass viewKey to read current state immediately before update. Create requires name/state and selects it; update patches only supplied keys, so omit name unless the user requested renaming and include only changed state keys. Select remembers a view. " +
    "Clear filters with [], search with an empty string, and sort/grouping with null; filters are ANDed. Timeline views accept only filters and sortDescriptor. Use only filter fields config returns for that surface, following their descriptions; never create a custom column to manufacture a missing saved-view filter. If the requested field is absent, report that it is unavailable and leave the view unchanged. Record option IDs come from get_record_model. " +
    "Relative days (last N, over N ago, N-M ago) use whole-day inLastDays/notInLastDays, never absolute dates. Verify every requested condition in the saved state before reporting success. " +
    "Deleting a view moves it to Trash, where it is deleted permanently after 30 days unless manage_trash restores it with the returned trashBatchId; it never deletes records, and All (__all__) cannot be renamed or deleted. Use the returned link rather than constructing one.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: ManageDataViewsToolSchema,
  outputSchema: ManageDataViewsResultSchema,
  execute: async (params: unknown) => {
    const parsed = await ManageDataViewsSchema.safeParseAsync(params, await getZodParseContext());
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    const result = await getManageDataViewsInteractor().invoke(parsed.data);
    if (!result.ok) return mcpInteractorFailure(result.error);
    return toonResult(result.data);
  },
} satisfies McpTool;

export const proposingManageDataViewsTool = {
  ...manageDataViewsTool,
  execute: async (params: unknown) => {
    const parsed = await ManageDataViewsSchema.safeParseAsync(params, await getZodParseContext());
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    const result = await getManageDataViewsInteractor().propose(parsed.data);
    if (!result.ok) return mcpInteractorFailure(result.error);
    return toonResult(result.data);
  },
} satisfies McpTool;
