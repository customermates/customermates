import type { GetResult } from "@/core/base/base-get.interactor";

import { z } from "zod";

import { EntityType, MessagingThreadType } from "@/generated/prisma";
import { CalendarEventSchema } from "@/ee/calendar/calendar.schema";
import { GetQueryParamsSchema, createGetResultSchema } from "@/core/base/base-get.schema";

import { MessagingMessageDtoSchema } from "../inbox/inbox.schema";
import { MessagingProviderSchema } from "../messaging.schema";
import { AuditChangeSchema } from "@/ee/audit-log/audit-log-changes";

const CalendarEventDtoSchema = CalendarEventSchema.pick({
  id: true,
  title: true,
  description: true,
  location: true,
  conferenceUrl: true,
  allDay: true,
  status: true,
  startsAt: true,
  endsAt: true,
}).extend({
  provider: MessagingProviderSchema,
  organizer: z.object({ email: z.string(), displayName: z.string().nullable() }).nullable(),
  attendees: z.array(
    z.object({
      email: z.string(),
      displayName: z.string().nullable(),
      responseStatus: z.string().nullable(),
    }),
  ),
});
export type ActivityCalendarEvent = z.infer<typeof CalendarEventDtoSchema>;

export const ActorSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
  email: z.string(),
});

export const ActivityThreadRefSchema = z.object({
  type: z.enum(MessagingThreadType),
  label: z.string(),
});

export type ActivityThreadRef = z.infer<typeof ActivityThreadRefSchema>;

export const ActivityEntryDtoSchema = z.union([
  z.object({
    kind: z.literal("audit"),
    id: z.string(),
    at: z.date(),
    actor: ActorSchema,
    event: z.string(),
    changes: z.array(AuditChangeSchema),
  }),
  z.object({
    kind: z.literal("message"),
    id: z.string(),
    at: z.date(),
    message: MessagingMessageDtoSchema,
    thread: ActivityThreadRefSchema,
  }),
  z.object({
    kind: z.literal("activity"),
    id: z.string(),
    at: z.date(),
    payload: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal("calendar_event"),
    id: z.string(),
    at: z.date(),
    event: CalendarEventDtoSchema,
  }),
]);

export type ActivityEntryDto = z.infer<typeof ActivityEntryDtoSchema>;
export type ActivityKind = ActivityEntryDto["kind"];

export const ACTIVITY_KINDS = ["audit", "message", "activity", "calendar_event"] as const;

export const ActivityThreadOptionDtoSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  provider: z.string(),
});
export type ActivityThreadOptionDto = z.infer<typeof ActivityThreadOptionDtoSchema>;

export const ActivitiesParamsSchema = GetQueryParamsSchema.extend({
  entityType: z.enum(EntityType).optional(),
  entityId: z.uuid().optional(),
});
export type ActivitiesParams = z.infer<typeof ActivitiesParamsSchema>;

export const ActivitiesResultSchema = createGetResultSchema(ActivityEntryDtoSchema);
export type ActivitiesResult = GetResult<ActivityEntryDto>;
