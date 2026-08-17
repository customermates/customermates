import type { GetResult } from "@/core/base/base-get.interactor";

import { z } from "zod";

import { EntityType, MessagingProvider, MessagingThreadType } from "@/generated/prisma";
import { CalendarEventSchema } from "@/ee/calendar/calendar.schema";
import {
  GetQueryParamsApiSchema,
  GetQueryParamsSchema,
  PaginationRequestSchema,
  createGetResultSchema,
} from "@/core/base/base-get.schema";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { FilterFieldKey } from "@/core/types/filter-field-key";
import { TIMELINE_KIND_FILTER_VALUES } from "@/core/types/filter-field-value-kind";

import { MessagingMessageDtoSchema } from "../inbox/inbox.schema";
import { MessagingProviderSchema } from "../messaging.schema";
import { AuditChangeSchema } from "@/features/audit-log/audit-log-changes";
import { ACTIVITY_RELATED_RECORD_LIMIT } from "./activity-record-refs";
import { ACTIVITY_MAX_PAGE, ActivityScopeSchema } from "./activity-scope.schema";

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
  id: z.uuid(),
  type: z.enum(MessagingThreadType),
  label: z.string(),
});

export type ActivityThreadRef = z.infer<typeof ActivityThreadRefSchema>;

export const ActivityRecordRefSchema = z.object({
  entityType: z.enum(EntityType),
  id: z.uuid(),
  label: z.string(),
  avatarUrl: z.string().nullish(),
});

export type ActivityRecordRefDto = z.infer<typeof ActivityRecordRefSchema>;

export const ActivityRecordContextSchema = z.object({
  primary: ActivityRecordRefSchema.nullable(),
  related: z.array(ActivityRecordRefSchema).max(ACTIVITY_RELATED_RECORD_LIMIT),
  relatedOverflow: z.number().int().min(0),
});

export type ActivityRecordContextDto = z.infer<typeof ActivityRecordContextSchema>;

export const ActivityEntryDtoSchema = z.union([
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

export const ACTIVITY_KINDS = ["audit", "message", "activity", "calendar_event"] as const;

const ActivityInOperatorSchema = z.literal(FilterOperatorKey.in).meta({ title: "in" });
const ActivityNotInOperatorSchema = z.literal(FilterOperatorKey.notIn).meta({ title: "notIn" });
const ActivityHasSomeOperatorSchema = z.literal(FilterOperatorKey.hasSome).meta({ title: "hasSome" });
const ActivityHasNoneOperatorSchema = z.literal(FilterOperatorKey.hasNone).meta({ title: "hasNone" });
export const ACTIVITY_FILTER_VALUE_MAX = 50;
const ActivityIdValuesSchema = z.array(z.uuid()).min(1).max(ACTIVITY_FILTER_VALUE_MAX);

const RELATION_EXISTENCE_OPERATORS = new Set<string>([FilterOperatorKey.hasSome, FilterOperatorKey.hasNone]);

function stripAbsentExistenceValue(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;

  const filter = input as Record<string, unknown>;
  if (!RELATION_EXISTENCE_OPERATORS.has(filter.operator as string)) return input;
  if (!("value" in filter) || filter.value !== undefined) return input;

  const withoutValue: Record<string, unknown> = { ...filter };
  delete withoutValue.value;

  return withoutValue;
}

const activityRelationFilterSchema = <TField extends FilterFieldKey>(field: TField) =>
  z.preprocess(
    stripAbsentExistenceValue,
    z.discriminatedUnion("operator", [
      z
        .object({
          field: z.literal(field),
          operator: z.union([ActivityInOperatorSchema, ActivityNotInOperatorSchema]),
          value: ActivityIdValuesSchema,
        })
        .strict(),
      z
        .object({
          field: z.literal(field),
          operator: z.union([ActivityHasSomeOperatorSchema, ActivityHasNoneOperatorSchema]),
        })
        .strict(),
    ]),
  );

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
      field: z.literal(FilterFieldKey.timelineThreadId),
      operator: z.union([ActivityInOperatorSchema, ActivityNotInOperatorSchema]),
      value: ActivityIdValuesSchema,
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
      field: z.literal(FilterFieldKey.connectedAccountId),
      operator: z.union([ActivityInOperatorSchema, ActivityNotInOperatorSchema]),
      value: ActivityIdValuesSchema,
    })
    .strict(),
  activityRelationFilterSchema(FilterFieldKey.contactIds),
  activityRelationFilterSchema(FilterFieldKey.organizationIds),
  activityRelationFilterSchema(FilterFieldKey.dealIds),
  activityRelationFilterSchema(FilterFieldKey.serviceIds),
  activityRelationFilterSchema(FilterFieldKey.taskIds),
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

const ActivitiesPaginationSchema = PaginationRequestSchema.extend({
  page: z.number().int().min(1),
});

function refineActivityPage(data: { pagination?: { page?: number } }, ctx: z.RefinementCtx) {
  const page = data.pagination?.page;

  if (page !== undefined && page > ACTIVITY_MAX_PAGE) {
    ctx.addIssue({
      code: "custom",
      params: { error: CustomErrorCode.activityPageOutOfRange },
      path: ["pagination", "page"],
    });
  }
}

export const ActivityThreadOptionDtoSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  provider: z.string(),
});
export type ActivityThreadOptionDto = z.infer<typeof ActivityThreadOptionDtoSchema>;

export const ActivitiesParamsSchema = GetQueryParamsSchema.pick({
  filters: true,
  sortDescriptor: true,
  p13nId: true,
})
  .extend({
    filters: ActivityFiltersSchema.optional(),
    pagination: ActivitiesPaginationSchema.optional(),
    scope: ActivityScopeSchema.optional(),
  })
  .superRefine(refineActivityPage);
export type ActivitiesParams = z.infer<typeof ActivitiesParamsSchema>;

export const ActivitiesApiParamsSchema = GetQueryParamsApiSchema.pick({
  filters: true,
  sortDescriptor: true,
})
  .extend({
    filters: ActivityFiltersSchema.optional(),
    pagination: ActivitiesPaginationSchema.optional(),
    scope: ActivityScopeSchema.optional(),
  })
  .strict()
  .superRefine(refineActivityPage);
export type ActivitiesApiParams = z.infer<typeof ActivitiesApiParamsSchema>;

export const ActivitiesResultSchema = createGetResultSchema(ActivityEntryDtoSchema).extend({
  filters: ActivityFiltersSchema.optional(),
  availableSources: z.array(z.enum(ACTIVITY_KINDS)),
  pageLimitReached: z.boolean(),
  scopeTruncated: z.boolean(),
});
export type ActivitiesResult = GetResult<ActivityEntryDto> & {
  availableSources: ActivityKind[];
  pageLimitReached: boolean;
  scopeTruncated: boolean;
};
