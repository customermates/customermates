import type { $ZodIssue, $ZodRawIssue } from "zod/v4/core";
import type { McpTool } from "./mcp-tool";

import { z } from "zod";

import { getManageDataViewsInteractor } from "@/core/di";
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
      .enum(["surfaces", "config", "list", "create", "update", "select", "delete"])
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
      "config only. Defaults to overview; use filters, sorting or grouping for paged field metadata.",
    ),
    page: ManageDataViewPageSchema.optional().describe(
      "Config and summary-list only. 1-indexed page; default 1. Ignored when list has an exact viewKey.",
    ),
    pageSize: ManageDataViewPageSizeSchema.optional().describe(
      "Config and summary-list only. Results per page, 1-25, rounded up to 5, 10 or 25; default 10. Ignored for an exact viewKey.",
    ),
    query: ManageDataViewQuerySchema.describe(
      "Config and summary-list only. Narrow by an exact or partial field id, label, view id or view name after a truncated or broad result. Ignored for an exact viewKey.",
    ),
    name: z.string().trim().min(1).max(DATA_VIEW_NAME_MAX_LENGTH).optional().describe("Required on create."),
    state: AgentDataViewStateSchema.optional().describe(
      "Call config first. Create: initial state. Update: call list immediately before every update with the exact viewKey; include only keys the user asked to change. Arrays replace. Never copy old conversation/full state.",
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
    "Read and change personal saved views on supported workspace pages; operator-console views are outside this tool. " +
    "Use surfaces to discover authorized pages. For config, start with section overview, then page filters, sorting or grouping; narrow with query and retry a narrower page after any truncation. " +
    "List without viewKey returns paged summaries; pass an exact viewKey to read its current state immediately before update. Create requires name and state and selects the new view; update patches only supplied name/state keys, so omit name unless the user requested a rename and include only changed state keys; select remembers a view. " +
    "Clear filters with [], search with an empty string, and sort/grouping with null; filters are ANDed. Timeline views accept only filters and sortDescriptor. Use only filter fields returned by config for that surface; never create a custom column to manufacture a missing saved-view filter. If the requested field is absent, report that it is unavailable and leave the view unchanged. Custom-column option ids come from get_record_schema. " +
    "Deleting a view is IRREVERSIBLE and never deletes records; All (__all__) cannot be renamed or deleted. Use the returned link rather than constructing one.",
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
