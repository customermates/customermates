import { structuredOperation } from "@/core/openapi/structured-operation";

import {
  CreateDataViewRequestSchema,
  DataViewConfigRequestSchema,
  DataViewSurfacesRequestSchema,
  DeleteDataViewRequestSchema,
  ListDataViewsRequestSchema,
  ManageDataViewsResultSchema,
  ReadDataViewRequestSchema,
  SelectDataViewRequestSchema,
  UpdateDataViewRequestSchema,
} from "./manage-data-views.schema";
import { ResetDataViewStateSchema } from "./reset-data-view-state.schema";

const TAG = "data-views";
const VIEW_ID = "6f1c2d3e-4b5a-4c6d-8e7f-1a2b3c4d5e6f";
const RECORD_SURFACE = "records:0b8c7d6e-5f4a-4b3c-9d2e-1f0a9b8c7d6e";
const ACCESS =
  "read access to the surface's page: read access to the record type for a `records:<typeId>` surface, read on users for Members and Roles, read all on api for Webhooks, read all on activityLog for Activity, read on routines for Routines, and read on inboxMessages plus the messaging entitlement for Inbox. Dashboard and record timeline views need no extra permission. Saved views are personal: only the caller's own views are listed or changed.";
const SURFACES =
  "Surfaces are the record lists (`records:<typeId>`), the Members, Roles, Webhooks, Webhook deliveries, Inbox, Activity and Routines lists, record activity timelines and the dashboard (`dashboard`); operator-console surfaces are not available. Timeline views accept only filters and sortDescriptor.";

const operation = (
  path: string,
  operationId: string,
  summary: string,
  description: string,
  input: Parameters<typeof structuredOperation>[0]["input"],
  example: unknown,
  outputDescription: string,
) => ({
  [path]: {
    post: structuredOperation({
      operationId,
      summary,
      description,
      requires: ACCESS,
      tag: TAG,
      input,
      output: ManageDataViewsResultSchema,
      outputDescription,
      example,
    }),
  },
});

export const dataViewApiPaths = {
  ...operation(
    "/v1/data-views/surfaces",
    "listDataViewSurfaces",
    "List the pages that support saved views",
    `Returns every surface the caller may manage views on, with its label and app path. ${SURFACES} Send an empty object.`,
    DataViewSurfacesRequestSchema,
    {},
    "action surfaces, total and items with surfaceKey, label and path.",
  ),
  ...operation(
    "/v1/data-views/config",
    "readDataViewConfiguration",
    "Read what a surface's views can filter, sort, group and show",
    "Returns one section of a surface's view capabilities. overview (the default) reports totals, whether search is supported, the view modes and the writable state keys. filters lists filterable fields with their operators and valid values (select filters use stable option IDs), sorting the sortable fields, grouping the groupable fields, and appearance the columns available for columnOrder, columnWidths and hiddenColumns. Sections are paged with page and pageSize (1 to 25, default 10) and can be narrowed with query.",
    DataViewConfigRequestSchema,
    { surfaceKey: RECORD_SURFACE, section: "filters", page: 1, pageSize: 25 },
    "action config, the section and its paged items, or the overview totals.",
  ),
  ...operation(
    "/v1/data-views/list",
    "listDataViews",
    "List saved views of a surface",
    "Returns the caller's saved views of one surface as paged summaries (id, name, position) with the active view key. The All view (`__all__`) is the surface's own personalization and is not listed; read it with viewKey `__all__`. Narrow with query by view id or name.",
    ListDataViewsRequestSchema,
    { surfaceKey: "dashboard", page: 1, pageSize: 10 },
    "action list, total, paging and items with id, name and position, plus activeViewKey.",
  ),
  ...operation(
    "/v1/data-views/read",
    "readDataView",
    "Read one saved view's state",
    "Returns one view with its complete state: filters, search term, sort, page size, view mode (table or card), grouping with its group summaries, column order, column widths and hidden columns. viewKey `__all__` reads the All view. Read immediately before an update.",
    ReadDataViewRequestSchema,
    { surfaceKey: RECORD_SURFACE, viewKey: VIEW_ID },
    "action read with one item holding the view's id, name, position and state, plus activeViewKey.",
  ),
  ...operation(
    "/v1/data-views/create",
    "createDataView",
    "Create a saved view",
    "Creates a named view with its initial state and selects it. The state is validated against the surface's configuration: fields, operators, sort and grouping keys and columns must come from /v1/data-views/config. Dashboard views hold no list state; create them with an empty state and place widgets on them with viewId.",
    CreateDataViewRequestSchema,
    {
      surfaceKey: RECORD_SURFACE,
      name: "Open deals",
      state: { sortDescriptor: { field: "system:updatedAt", direction: "desc" }, pageSize: 25 },
    },
    "action create, surfaceKey, viewKey (the new view id), the saved state, link and selected true.",
  ),
  ...operation(
    "/v1/data-views/update",
    "updateDataView",
    "Update a saved view",
    "Patches a view: send only the keys to change. Omitted state keys keep their value, arrays replace the previous value, an empty filters array clears filters, an empty searchTerm clears search, and null clears sortDescriptor or grouping. name renames a named view; the All view cannot be renamed. A request that changes nothing returns the current view unchanged.",
    UpdateDataViewRequestSchema,
    { surfaceKey: RECORD_SURFACE, viewKey: VIEW_ID, state: { hiddenColumns: ["system:createdAt"] } },
    "action update, surfaceKey, viewKey, the resulting state and link.",
  ),
  ...operation(
    "/v1/data-views/select",
    "selectDataView",
    "Select a saved view",
    "Remembers the view as the caller's active view of the surface, as choosing it in the app does.",
    SelectDataViewRequestSchema,
    { surfaceKey: "dashboard", viewKey: VIEW_ID },
    "action select, surfaceKey, viewKey, link and selected true.",
  ),
  ...operation(
    "/v1/data-views/reset",
    "resetDataView",
    "Reset saved view settings",
    "Removes the caller's overrides for the given state keys so the list falls back to every field in its configured order, ungrouped and unsorted. Only `records:<typeId>` surfaces support reset.",
    ResetDataViewStateSchema,
    { surfaceKey: RECORD_SURFACE, viewKey: "__all__", fields: ["columnOrder", "hiddenColumns"] },
    "action reset, surfaceKey, viewKey and link.",
  ),
  ...operation(
    "/v1/data-views/delete",
    "deleteDataView",
    "Delete a saved view",
    "Moves a named view to Trash; when it was the active view, the surface falls back to All. Deleting a dashboard view moves its widgets to Trash with it, and restoring the view brings them back. The view is deleted permanently after 30 days unless /v1/trash/restore restores it with the returned trashBatchId. Records are never deleted, and the All view cannot be deleted.",
    DeleteDataViewRequestSchema,
    { surfaceKey: "dashboard", viewKey: VIEW_ID },
    "action delete, surfaceKey, viewKey, deleted true and trashBatchId.",
  ),
};
