import type { McpTool } from "./mcp-tool";

import { getManageCalendarInteractor } from "@/core/di";
import { ManageCalendarResultSchema, ManageCalendarSchema } from "@/features/planner/manage-calendar.schema";

import { mcpValidationFailure, runInteractor, toonResult } from "./utils";

export const manageCalendarTool = {
  name: "manage_calendar",
  title: "Manage the personal Calendar page",
  description:
    "Read and change the caller's personal Calendar page, which combines dated records of several lists with the caller's connected calendars. " +
    "Call options first: it lists every list with a date field (dateFields and select colorFields by stable ID) and, when the plan and role allow it, the caller's own connected calendars. " +
    "read returns the configuration and saved; while saved is false the caller has made no choice and sees a default with the first date field of each list, up to 12 lists. " +
    "update replaces only the keys it receives: sources is the complete list of date sources (keep the id of a source you keep, omit it for a new one), calendarIds the complete list of shown calendars. " +
    "A source takes typeId, calendar {dateFieldId, endDateFieldId, colorFieldId}, filters, enabled and color; endDateFieldId is another field of the same date or date-time type and is not used with a range field. " +
    "Source filters use the filter fields and operators of manage_data_views config for surfaceKey records:<typeId>, section filters; filters are ANDed. " +
    "Set timeZone (IANA) together with the first update, because the default is UTC. Every write is validated and returns the saved configuration; verify it before reporting success. " +
    "reset removes the personal configuration, so the default applies again. These actions never change records, calendar events or another user's Calendar page. " +
    "subscriptions lists the caller's calendar feed links; revoke permanently disables one, and calendar apps that subscribed to it stop updating.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
  inputSchema: ManageCalendarSchema,
  outputSchema: ManageCalendarResultSchema,
  execute: (input: unknown) => {
    const parsed = ManageCalendarSchema.safeParse(input);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    return runInteractor(getManageCalendarInteractor().invoke(parsed.data), toonResult);
  },
} satisfies McpTool;
