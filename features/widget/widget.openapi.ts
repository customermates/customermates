import { z } from "zod";

import { structuredOperation } from "@/core/openapi/structured-operation";

import { DeleteWidgetResultSchema, DeleteWidgetSchema } from "./delete-widget.interactor";
import { SavedWidgetLayoutSchema, UpdateWidgetLayoutsSchema } from "./update-widget-layouts.interactor";
import { WidgetDtoSchema } from "./widget.schema";
import { WIDGET_GRID_BREAKPOINT_COLUMNS, WIDGET_GRID_ROW_HEIGHT } from "./widget-grid";

const TAG = "widgets";
const ROW = WIDGET_GRID_ROW_HEIGHT;
const COLUMNS = (Object.entries(WIDGET_GRID_BREAKPOINT_COLUMNS) as Array<[string, number]>)
  .reverse()
  .map(([breakpoint, columns]) => `${columns} on ${breakpoint}`)
  .join(", ");
const ACCESS =
  "an active workspace member. Widgets are personal: the list holds the caller's own widgets, and delete and layout change only widgets the caller owns. Widget results stay filtered by the caller's record access.";
const WIDGET_ID = "3a4b5c6d-7e8f-4a1b-9c2d-3e4f5a6b7c8d";
const SECOND_WIDGET_ID = "4b5c6d7e-8f9a-4b2c-8d3e-4f5a6b7c8d9e";

export const WidgetListRequestSchema = z.object({}).strict();
export const WidgetListResultSchema = z.object({ widgets: z.array(WidgetDtoSchema) }).strict();

const sideBySide = (columns: number) => [
  { i: WIDGET_ID, x: 0, y: 0, w: columns / 2, h: 3 },
  { i: SECOND_WIDGET_ID, x: columns / 2, y: 0, w: columns / 2, h: 3 },
];
const stacked = (columns: number) => [
  { i: WIDGET_ID, x: 0, y: 0, w: columns, h: 3 },
  { i: SECOND_WIDGET_ID, x: 0, y: 3, w: columns, h: 3 },
];

export const widgetApiPaths = {
  "/v1/widgets/list": {
    post: structuredOperation({
      operationId: "listRecordWidgets",
      summary: "List all dashboard widgets",
      description: `Returns every widget the caller owns across the main dashboard and every dashboard view, oldest first, with current authorized results. viewId names the dashboard view a widget belongs to (null for the main dashboard) and layout holds its stored position per breakpoint (xs, sm, md, lg) in grid units: x and w count columns (${COLUMNS}) and y and h count rows of ${ROW} px. A breakpoint without a stored position is placed automatically when the dashboard renders. Send an empty object.`,
      requires: ACCESS,
      tag: TAG,
      input: WidgetListRequestSchema,
      output: WidgetListResultSchema,
      outputDescription: "Every widget the caller owns, in creation order.",
      example: {},
    }),
  },
  "/v1/widgets/delete": {
    post: structuredOperation({
      operationId: "deleteRecordWidget",
      summary: "Delete a widget",
      description:
        "Moves one widget to Trash, as deleting it on the dashboard does. It is deleted permanently after 30 days unless /v1/trash/restore restores it with the returned trashBatchId. Its source records are never changed.",
      requires: ACCESS,
      tag: TAG,
      input: DeleteWidgetSchema,
      output: DeleteWidgetResultSchema,
      outputDescription: "The deleted widget id and the Trash batch that restores it.",
      example: { id: WIDGET_ID },
    }),
  },
  "/v1/widgets/layout": {
    post: structuredOperation({
      operationId: "updateRecordWidgetLayouts",
      summary: "Move and resize widgets in one batch",
      description: `Saves the position and size of several widgets at once, as dragging and resizing on the dashboard does. Each breakpoint (xs, sm, md, lg) lists placements in grid units: i is the widget id, x and w count columns (${COLUMNS}, and x + w must fit), and y and h count rows of ${ROW} px. A widget named in any breakpoint has its whole stored layout replaced by the placements sent for it, so send all four breakpoints for every widget you move; a breakpoint it is missing from loses its stored position and is placed automatically. Layouts are per dashboard view because a widget belongs to one view. Overlaps are not rejected here: the dashboard floats widgets up into empty rows and pushes overlapping widgets down when it renders. Widgets the caller does not own, and unchanged placements, are ignored. Read positions with /v1/widgets/list first.`,
      requires: ACCESS,
      tag: TAG,
      input: UpdateWidgetLayoutsSchema,
      output: z.array(SavedWidgetLayoutSchema),
      outputDescription: "Each changed widget with its new version and saved layout; unchanged widgets are omitted.",
      example: {
        layouts: {
          xs: stacked(2),
          sm: stacked(4),
          md: sideBySide(8),
          lg: sideBySide(12),
        },
      },
    }),
  },
};
