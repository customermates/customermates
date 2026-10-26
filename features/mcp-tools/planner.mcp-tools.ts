import type { McpTool } from "./mcp-tool";

import {
  getGetPlannerOptionsInteractor,
  getManageCalendarSubscriptionsInteractor,
  getSavePlannerInteractor,
} from "@/core/di";
import { ManageCalendarResultSchema, ManageCalendarSchema } from "@/features/planner/manage-calendar.schema";
import { isCalendarColorField, isCalendarDateField } from "@/features/record-calendar/record-calendar-query";

import { mcpValidationFailure, runInteractor, toonResult } from "./utils";

export const manageCalendarTool = {
  name: "manage_calendar",
  title: "Manage the personal Calendar page",
  description:
    "Read, change or reset the caller's personal Calendar page, which combines dated records of several lists with the caller's connected calendars. " +
    "Call options first for the lists with date fields, their select colorFields and, when the plan and role allow it, the caller's own connected calendars, all by stable ID. " +
    "read returns the configuration; while saved is false the caller sees a default with the first single date field of each list (else its first date range), up to twelve lists. " +
    "Call read immediately before update and send only the config keys the user asked to change: sources and calendarIds each replace the whole list, so start from the current one and keep the id of a source you keep. Source filters use the filter fields of manage_data_views config for surfaceKey records:<typeId>. " +
    "Set timeZone with the first update, because the default is UTC, and verify the returned configuration. reset removes the personal configuration, so the default applies again. " +
    "These actions never change records, calendar events or another user's Calendar page. subscriptions lists the caller's calendar subscription URLs; revoke permanently disables one and calendar apps subscribed to it stop updating.",
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
    const { action, config, id } = parsed.data;
    if (action === "subscriptions" || action === "revoke") {
      return runInteractor(
        getManageCalendarSubscriptionsInteractor().invoke(id ? { action: "revoke", id } : { action: "list" }),
        ({ subscriptions }) => toonResult({ action, subscriptions }),
      );
    }
    if (action === "update" || action === "reset") {
      return runInteractor(getSavePlannerInteractor().invoke({ config: config ?? null }), (data) =>
        toonResult({ action, ...data }),
      );
    }
    return runInteractor(getGetPlannerOptionsInteractor().invoke(), ({ model, config, saved, ...personal }) =>
      action === "read"
        ? toonResult({ action, saved, config })
        : toonResult({
            action,
            lists: model.types
              .filter((type) => !type.archived && !type.embedded)
              .map((type) => {
                const fields = model.fields.filter((field) => field.typeId === type.id);
                return {
                  typeId: type.id,
                  label: type.pluralLabel,
                  dateFields: fields
                    .filter(isCalendarDateField)
                    .map(({ id, label, valueType }) => ({ id, label, valueType })),
                  colorFields: fields.filter(isCalendarColorField).map(({ id, label }) => ({ id, label })),
                };
              })
              .filter((list) => list.dateFields.length > 0),
            ...personal,
          }),
    );
  },
} satisfies McpTool;
