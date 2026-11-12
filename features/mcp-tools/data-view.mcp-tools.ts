import type { $ZodIssue, $ZodRawIssue } from "zod/v4/core";
import type { McpTool } from "./mcp-tool";

import { z } from "zod";

import { getManageDataViewsInteractor } from "@/core/di";
import { DATA_VIEW_STATE_FIELDS, DataViewVisibilitySchema } from "@/core/data-view/data-view-state.schema";
import { AiManageableDataViewSurfaceKeySchema } from "@/core/data-view/ai-manageable-surfaces";
import { DATA_VIEW_NAME_MAX_LENGTH } from "@/core/data-view/data-view-limits";
import { ViewKeySchema } from "@/core/data-view/data-view-state.schema";
import { getZodParseContext } from "@/core/validation/zod-error-map-server";
import { env } from "@/env";
import { withWorkspaceHref } from "@/core/navigation/workspace-paths";
import {
  AgentDataViewStateSchema,
  DataViewConfigSectionSchema,
  ManageDataViewPageSchema,
  ManageDataViewPageSizeSchema,
  ManageDataViewQuerySchema,
  ManageDataViewsResultSchema,
  ManageDataViewsSchema,
} from "@/features/data-view/manage-data-views.schema";
import { DATA_VIEW_SHARE_ROLE_LIMIT } from "@/features/data-view/data-view.schema";

import { mcpInteractorFailure, mcpValidationFailure } from "./mcp-tool";
import { toonResult } from "./utils";
import { mcpWorkspaceSlug } from "./mcp-workspace-slug";

function isExternalMcpRequest(transport: unknown): boolean {
  return typeof transport === "object" && transport !== null && "requestId" in transport;
}

async function withAbsoluteLink<T extends { link?: string | null }>(result: T): Promise<T> {
  if (!result.link) return result;
  const link = withWorkspaceHref(result.link, await mcpWorkspaceSlug());
  return { ...result, link: new URL(link, env.BASE_URL).toString() };
}

function withoutRenderedMessage(issue: $ZodIssue): $ZodRawIssue {
  const raw: Record<string, unknown> = { ...issue };
  delete raw.message;
  return raw as $ZodRawIssue;
}

const ManageDataViewsToolSchema = z
  .object({
    action: z
      .enum(["surfaces", "config", "list", "create", "update", "select", "delete", "reset", "share", "publish"])
      .describe(
        "surfaces discovers supported pages; config reads one capability section; list pages view summaries or reads one exact view; create/update/select/delete change the caller's own views; reset removes personal overrides for the given fields; share sets who else in the workspace sees one of the caller's views; publish creates or revokes the public link of one of the caller's dashboard or list views.",
      ),
    surfaceKey: AiManageableDataViewSurfaceKeySchema.optional().describe(
      "Required for every action except surfaces. Operator-console surfaces are intentionally unavailable.",
    ),
    viewKey: ViewKeySchema.optional().describe(
      "list: optional exact view whose state is needed. Required for update/select/delete/share/publish. __all__ cannot be renamed, deleted, shared or published.",
    ),
    section: DataViewConfigSectionSchema.optional().describe(
      "config only. Defaults to overview; filters, sorting, grouping and appearance return paged field metadata.",
    ),
    page: ManageDataViewPageSchema.optional().describe(
      "Config and summary-list only. 1-indexed page; default 1. Ignored when list has an exact viewKey.",
    ),
    pageSize: ManageDataViewPageSizeSchema.optional().describe(
      "Config and summary-list only. Results per page, 1-25, served exactly; default 10. Ignored for an exact viewKey.",
    ),
    query: ManageDataViewQuerySchema.describe(
      "Config and summary-list only. Narrows to an exact or partial field id, label, view id or view name, useful after a truncated or broad result. Ignored for an exact viewKey.",
    ),
    name: z
      .string()
      .trim()
      .min(1)
      .max(DATA_VIEW_NAME_MAX_LENGTH)
      .optional()
      .describe("Required on create and delete. Delete requires the exact current view name; a different name fails."),
    fields: z
      .array(z.enum(DATA_VIEW_STATE_FIELDS))
      .min(1)
      .max(DATA_VIEW_STATE_FIELDS.length)
      .optional()
      .describe(
        "reset only: remove personal overrides for these keys; the list then shows every field in its configured order as an ungrouped, unsorted table. Only dynamic record surfaces support reset.",
      ),
    visibility: DataViewVisibilitySchema.optional().describe(
      "share only: private (only the owner), workspace (every member) or roles (members with one of roleIds).",
    ),
    roleIds: z
      .array(z.uuid())
      .min(1)
      .max(DATA_VIEW_SHARE_ROLE_LIMIT)
      .optional()
      .describe("share with visibility roles only: ids of workspace roles."),
    public: z
      .boolean()
      .optional()
      .describe(
        "publish only (surfaceKey dashboard or records:<typeId>): true creates a public link, false revokes it at once.",
      ),
    expiresAt: z.iso
      .date()
      .nullable()
      .optional()
      .describe("publish with public true only: optional last day (YYYY-MM-DD) the link opens."),
    state: AgentDataViewStateSchema.optional().describe(
      "Create: the initial state. Update: the keys to change relative to the view's current state. Keys equal to the listed value are no-ops, and arrays replace the stored array.",
    ),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.action === "delete" && data.name === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["name"],
        message: "Delete requires the exact current view name.",
      });
    }
    const parsed = ManageDataViewsSchema.safeParse(data);
    if (parsed.success) return;
    for (const issue of parsed.error.issues) ctx.addIssue(withoutRenderedMessage(issue));
  });

export const manageDataViewsTool = {
  name: "manage_data_views",
  title: "Manage saved views",
  description:
    "Manages saved views on supported workspace pages; operator-console views are excluded. " +
    "surfaces lists the authorized pages, including customer-defined record types; dynamic surface keys contain stable type IDs. Select filters use stable option IDs from config, not editable labels. config starts at overview and pages filters, sorting, grouping and appearance; query and page narrow a truncated result. " +
    "List returns paged summaries; with viewKey it returns that view's current state. Create requires name/state and selects it; update patches only supplied keys. Select remembers a view. Reset (dynamic record surfaces only) removes personal overrides for the given fields, so the list shows every field in its configured order as an ungrouped, unsorted table. " +
    "Record lists offer the layouts config lists in viewModes: table, card (a board grouped by a single choice) and calendar when the list has a date field; a calendar view sets viewMode calendar and calendar {dateFieldId, endDateFieldId, colorFieldId, mode} with fields from config appearance. " +
    "Filters are cleared with [], search with an empty string, and sort/grouping/calendar with null; filters are ANDed. Timeline views accept only filters and sortDescriptor. Filters accept only the filter fields config returns for that surface; no custom column is created for a missing saved-view filter, and a request for an absent field leaves the view unchanged. Record option IDs are those of the record model. " +
    "Relative days (last N, over N ago, N-M ago) are expressed as whole-day inLastDays/notInLastDays filters rather than absolute dates. " +
    "Views are private until shared: share with visibility workspace or roles (with roleIds) lets teammates open the view read-only, and each of them sees only the records and fields their own role allows; private stops sharing. List marks views others shared with the caller with sharedBy; the caller can select them but not update, delete or share them. " +
    "Publish (dashboard or list views the caller owns) creates a public link anyone can open without signing in, live, read-only and calculated with the owner's access: a dashboard shows its charts and numbers and opens the records behind a chart (calendar, map and activity widgets are left out); a list shows its table with only the visible columns, saved filters and sorting. It needs the publicLinks permission and public links allowed in the workspace and returns the link as publicLink.url. Publishing also shares the view with the whole workspace; public false revokes the link at once, and sharing the view privately or with roles afterwards revokes it too. " +
    "Deleting a view requires its exact current name and viewKey; a mismatched name returns a name-mismatch error without changing anything. Deletion moves the view to Trash (a dashboard view takes its widgets along), where it is deleted permanently after 30 days; the returned trashBatchId identifies the Trash batch it can be restored from. It does not delete records, and All (__all__) cannot be renamed or deleted. Responses carry the absolute link of the view.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: ManageDataViewsToolSchema,
  outputSchema: ManageDataViewsResultSchema,
  execute: async (params: unknown, transport?: unknown) => {
    const parsed = await ManageDataViewsSchema.safeParseAsync(params, await getZodParseContext());
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    const result = await getManageDataViewsInteractor().invoke(parsed.data);
    if (!result.ok) return mcpInteractorFailure(result.error);
    return toonResult(isExternalMcpRequest(transport) ? await withAbsoluteLink(result.data) : result.data);
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
