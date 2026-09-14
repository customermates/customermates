import type { McpTool } from "./mcp-tool";
import { z } from "zod";

import { getManageDataViewsInteractor } from "@/core/di";
import { AgentDataViewStateSchema, ManageDataViewsSchema } from "@/features/data-view/manage-data-views.schema";
import { SurfaceKeySchema, ViewKeySchema } from "@/core/data-view/data-view-state.schema";
import { mcpInteractorFailure, mcpValidationFailure } from "./mcp-tool";
import { toonResult } from "./utils";

const ManageDataViewsToolSchema = z
  .object({
    action: z.enum(["surfaces", "config", "list", "create", "update", "select", "delete"]),
    surfaceKey: SurfaceKeySchema.optional(),
    viewKey: ViewKeySchema.optional().describe("Required for update/select/delete. __all__: omit name; cannot delete."),
    name: z.string().trim().min(1).max(100).optional(),
    state: AgentDataViewStateSchema.optional().describe(
      "Call config first. Create: initial state. Update: call list immediately before every update; include only keys the user asked to change. Never copy old conversation/full state.",
    ),
  })
  .strict();

export const manageDataViewsTool = {
  name: "manage_data_views",
  title: "Manage personal saved views",
  description:
    "IRREVERSIBLE delete: views, never records. " +
    "surfaces: pages; config: filter fields/values/operators, sorts, layouts; " +
    "list: owned views, activeViewKey, All state. create requires name/state and selects it; update patches settings/name; " +
    "select remembers a view. Clear filters=[], search=empty string, sort/grouping=null; filters are ANDed. " +
    "Timeline: only filters/sortDescriptor; no name on All. Columns use Appearance. Operators need fresh auth. " +
    "Links clear URL overrides.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: ManageDataViewsToolSchema,
  outputSchema: z.looseObject({ surfaceKey: z.string().optional() }),
  execute: async (params: unknown) => {
    const parsed = ManageDataViewsSchema.safeParse(params);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    const result = await getManageDataViewsInteractor().invoke(parsed.data);
    if (!result.ok) return mcpInteractorFailure(result.error);
    return toonResult(result.data);
  },
} satisfies McpTool;
