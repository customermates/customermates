import type { GetResult } from "@/core/base/base-get.interactor";

import { z } from "zod";

import { MessagingProvider, MessagingThreadType } from "@/generated/prisma";
import { CalendarEventSchema } from "@/ee/calendar/calendar.schema";
import { createApiGetResultSchema, DataViewResultFields } from "@/core/base/base-get.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { TIMELINE_KIND_FILTER_VALUES } from "@/core/types/filter-field-value-kind";

import { MessagingMessageDtoSchema } from "../inbox/inbox.schema";
import { MessagingProviderSchema } from "../messaging.schema";
import { AuditChangeSchema } from "@/features/event/audit-changes";
import { ACTIVITY_RELATED_RECORD_LIMIT } from "./activity-record-refs";
import { RecordRefSchema } from "@/features/records/record-model.schema";
import { RecordHistoryChangesSchema } from "@/features/records/record-event.schema";
import { CHIP_COLORS } from "@/constants/chip-colors";

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

export const ActivityMemberSchema = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type ActivityMemberDto = z.infer<typeof ActivityMemberSchema>;

export const ActivityListAppearanceSchema = z.object({
  icon: z.string(),
  color: z.enum(CHIP_COLORS).nullable(),
});

export const ActivityThreadRefSchema = z.object({
  id: z.uuid(),
  type: z.enum(MessagingThreadType),
  label: z.string(),
});

export type ActivityThreadRef = z.infer<typeof ActivityThreadRefSchema>;

export const ActivityRecordRefSchema = z.object({
  ref: RecordRefSchema,
  label: z.string(),
  avatarUrl: z.string().nullable(),
  icon: z.string(),
});
export type ActivityRecordRefDto = z.infer<typeof ActivityRecordRefSchema>;

export const ActivityRecordContextSchema = z.object({
  primary: ActivityRecordRefSchema.nullable(),
  related: z.array(ActivityRecordRefSchema).max(ACTIVITY_RELATED_RECORD_LIMIT),
  relatedOverflow: z.number().int().min(0),
});

export type ActivityRecordContextDto = z.infer<typeof ActivityRecordContextSchema>;

export const CONFIGURATION_ACTIVITY_EVENTS = [
  "record_model.initialized",
  "record_model.updated",
  "record_grants.updated",
] as const;

export const ActivityEntryDtoSchema = z.union([
  z.object({
    kind: z.literal("record"),
    id: z.string(),
    at: z.date(),
    actor: ActorSchema,
    event: z.enum(["record.created", "record.updated", "record.deleted"]),
    changes: RecordHistoryChangesSchema,
    members: z.array(ActivityMemberSchema),
    lists: z.record(z.uuid(), ActivityListAppearanceSchema),
    records: ActivityRecordContextSchema,
  }),
  z.object({
    kind: z.literal("audit"),
    id: z.string(),
    at: z.date(),
    actor: ActorSchema,
    event: z.string(),
    changes: z.array(AuditChangeSchema),
    records: ActivityRecordContextSchema,
  }),
  z.object({
    kind: z.literal("configuration"),
    id: z.string(),
    at: z.date(),
    actor: ActorSchema,
    event: z.enum(CONFIGURATION_ACTIVITY_EVENTS),
    changes: z.array(AuditChangeSchema),
    records: ActivityRecordContextSchema,
  }),
  z.object({
    kind: z.literal("message"),
    id: z.string(),
    at: z.date(),
    message: MessagingMessageDtoSchema,
    thread: ActivityThreadRefSchema,
    senderIsMine: z.boolean(),
    records: ActivityRecordContextSchema,
  }),
  z.object({
    kind: z.literal("activity"),
    id: z.string(),
    at: z.date(),
    payload: z.record(z.string(), z.unknown()),
    records: ActivityRecordContextSchema,
  }),
  z.object({
    kind: z.literal("calendar_event"),
    id: z.string(),
    at: z.date(),
    event: CalendarEventDtoSchema,
    records: ActivityRecordContextSchema,
  }),
]);

export type ActivityEntryDto = z.infer<typeof ActivityEntryDtoSchema>;
export type ActivityKind = ActivityEntryDto["kind"];

export const CHANGE_ACTIVITY_KINDS = ["record", "audit", "configuration"] as const;
export const ACTIVITY_KINDS = [...CHANGE_ACTIVITY_KINDS, "message", "activity", "calendar_event"] as const;

export function isChangeActivityKind(kind: ActivityKind): kind is (typeof CHANGE_ACTIVITY_KINDS)[number] {
  return CHANGE_ACTIVITY_KINDS.some((change) => change === kind);
}

const ActivityInOperatorSchema = z.literal(FilterOperatorKey.in).meta({ title: "in" });
const ActivityNotInOperatorSchema = z.literal(FilterOperatorKey.notIn).meta({ title: "notIn" });
export const ACTIVITY_FILTER_VALUE_MAX = 50;
const ActivityIdValuesSchema = z.array(z.uuid()).min(1).max(ACTIVITY_FILTER_VALUE_MAX);

const ACTIVITY_ID_FILTER_FIELDS = [FilterFieldKey.timelineThreadId, FilterFieldKey.connectedAccountId] as const;

export const ActivityFilterSchema = z.union([
  z
    .object({
      field: z.literal(FilterFieldKey.timelineKind),
      operator: z.union([ActivityInOperatorSchema, ActivityNotInOperatorSchema]),
      value: z.array(z.enum(TIMELINE_KIND_FILTER_VALUES)).min(1).max(TIMELINE_KIND_FILTER_VALUES.length),
    })
    .strict(),
  z
    .object({
      field: z.literal(FilterFieldKey.provider),
      operator: ActivityInOperatorSchema,
      value: z.array(z.enum(MessagingProvider)).min(1).max(Object.keys(MessagingProvider).length),
    })
    .strict(),
  z
    .object({
      field: z.enum(ACTIVITY_ID_FILTER_FIELDS),
      operator: z.union([ActivityInOperatorSchema, ActivityNotInOperatorSchema]),
      value: ActivityIdValuesSchema,
    })
    .strict(),
]);

export const ActivityFiltersSchema = z
  .array(ActivityFilterSchema)
  .max(50)
  .superRefine((filters, ctx) => {
    const seen = new Set<string>();
    filters.forEach((filter, index) => {
      if (seen.has(filter.field)) {
        ctx.addIssue({
          code: "custom",
          params: { error: CustomErrorCode.activityDuplicateFilterField },
          path: [index, "field"],
        });
      }
      seen.add(filter.field);
    });
  })
  .describe("At most one rule per field; combine alternatives within one membership rule.");

export const ActivityThreadOptionDtoSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  provider: z.string(),
});
export type ActivityThreadOptionDto = z.infer<typeof ActivityThreadOptionDtoSchema>;

export const ActivitiesResultSchema = createApiGetResultSchema(ActivityEntryDtoSchema).extend({
  filters: ActivityFiltersSchema.optional(),
  availableSources: z.array(z.enum(ACTIVITY_KINDS)),
  pageLimitReached: z.boolean(),
  scopeTruncated: z.boolean(),
});

export const ActivitiesViewResultSchema = ActivitiesResultSchema.extend(DataViewResultFields);
export type ActivitiesResult = GetResult<ActivityEntryDto> & {
  availableSources: ActivityKind[];
  pageLimitReached: boolean;
  scopeTruncated: boolean;
};
