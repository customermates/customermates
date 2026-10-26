import { z } from "zod";
import { MessagingProvider } from "@/generated/prisma";

import { TimeZoneSchema } from "@/core/utils/time-zone";
import { RecordValueTypeSchema } from "@/features/records/record-model.schema";
import { PLANNER_MODES, PLANNER_SOURCE_LIMIT, PlannerConfigSchema, PlannerSourceSchema } from "./planner.schema";

export const MANAGE_CALENDAR_ACTIONS = ["options", "read", "update", "reset", "subscriptions", "revoke"] as const;

export const ManageCalendarSchema = z
  .object({
    action: z
      .enum(MANAGE_CALENDAR_ACTIONS)
      .describe(
        "options lists the lists with date fields and the caller's connected calendars; read returns the current configuration; update: sources, calendarIds, timeZone, mode; reset removes the personal configuration; subscriptions lists calendar feed links; revoke: subscriptionId.",
      ),
    sources: z
      .array(
        PlannerSourceSchema.extend({
          id: z.uuid().optional().describe("Id of an existing source to keep; omit for a new source."),
        }),
      )
      .max(PLANNER_SOURCE_LIMIT)
      .optional()
      .describe("update only: the complete list of date sources; it replaces the current list."),
    calendarIds: PlannerConfigSchema.shape.calendarIds
      .optional()
      .describe(
        "update only: the caller's own connected calendars to show, from options; it replaces the current list.",
      ),
    timeZone: TimeZoneSchema.optional().describe(
      "update only: IANA time zone that decides today and the day of timed entries.",
    ),
    mode: z.enum(PLANNER_MODES).optional().describe("update only: the layout the Calendar page opens with."),
    subscriptionId: z.uuid().optional().describe("revoke only: the calendar feed link to revoke, from subscriptions."),
  })
  .strict()
  .superRefine((input, ctx) => {
    const patch = [input.sources, input.calendarIds, input.timeZone, input.mode].some((value) => value !== undefined);
    if (input.action === "update" && !patch) {
      ctx.addIssue({
        code: "custom",
        message: "Update requires sources, calendarIds, timeZone or mode.",
      });
    }
    if (input.action !== "update" && patch) {
      ctx.addIssue({
        code: "custom",
        message: "Only update accepts sources, calendarIds, timeZone or mode.",
      });
    }
    if ((input.action === "revoke") !== (input.subscriptionId !== undefined)) {
      ctx.addIssue({
        code: "custom",
        path: ["subscriptionId"],
        message: "Only revoke requires a subscriptionId.",
      });
    }
  });
export type ManageCalendarInput = z.infer<typeof ManageCalendarSchema>;

const NamedFieldSchema = z.object({ id: z.uuid(), label: z.string() }).strict();

export const ManageCalendarResultSchema = z
  .object({
    action: z.enum(MANAGE_CALENDAR_ACTIONS),
    saved: z
      .boolean()
      .optional()
      .describe("False while the caller has no personal configuration and sees the default derived from the lists."),
    config: PlannerConfigSchema.optional(),
    lists: z
      .array(
        z
          .object({
            typeId: z.uuid(),
            label: z.string(),
            dateFields: z.array(
              NamedFieldSchema.extend({
                valueType: RecordValueTypeSchema,
              }).strict(),
            ),
            colorFields: z.array(NamedFieldSchema),
          })
          .strict(),
      )
      .optional(),
    personalAvailable: z.boolean().optional(),
    calendars: z
      .array(
        z
          .object({
            id: z.uuid(),
            name: z.string(),
            provider: z.enum(MessagingProvider),
          })
          .strict(),
      )
      .optional(),
    subscriptions: z.array(z.object({ id: z.uuid(), createdAt: z.string() }).strict()).optional(),
  })
  .strict();
export type ManageCalendarResult = z.infer<typeof ManageCalendarResultSchema>;
