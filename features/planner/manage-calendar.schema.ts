import { z } from "zod";
import { MessagingProvider } from "@/generated/prisma";

import { RecordValueTypeSchema } from "@/features/records/record-model.schema";
import { PlannerConfigSchema, SavePlannerSchema } from "./planner.schema";

export const MANAGE_CALENDAR_ACTIONS = ["options", "read", "update", "reset", "subscriptions", "revoke"] as const;

export const ManageCalendarSchema = z
  .object({
    action: z
      .enum(MANAGE_CALENDAR_ACTIONS)
      .describe(
        "options lists the lists with date fields and the caller's connected calendars; read returns the current configuration; update: config; reset removes the personal configuration; subscriptions lists calendar subscription URLs; revoke: id.",
      ),
    config: SavePlannerSchema.shape.config
      .unwrap()
      .optional()
      .describe("update only: the keys to change; sources and calendarIds replace the current lists."),
    id: z.uuid().optional().describe("revoke only: the calendar subscription URL to revoke, from subscriptions."),
  })
  .strict()
  .superRefine((input, ctx) => {
    if ((input.action === "update") !== (input.config !== undefined))
      ctx.addIssue({ code: "custom", path: ["config"], message: "Only update requires a config." });
    if ((input.action === "revoke") !== (input.id !== undefined))
      ctx.addIssue({ code: "custom", path: ["id"], message: "Only revoke requires an id." });
  });
export type ManageCalendarInput = z.infer<typeof ManageCalendarSchema>;

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
              z.object({ id: z.uuid(), label: z.string(), valueType: RecordValueTypeSchema }).strict(),
            ),
            colorFields: z.array(z.object({ id: z.uuid(), label: z.string() }).strict()),
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
