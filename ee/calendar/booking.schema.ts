import type { PublicBlocked } from "@/core/network/public-access";

import type { AnswerQuestion } from "@/features/records/record-value-coercion";
import type { WorkspaceBrand } from "@/features/workspace-brand/workspace-brand.schema";

import { z } from "zod";

import { TimeZoneSchema } from "@/core/utils/time-zone";

import { WorkingHoursSchema } from "./working-hours";

export const BOOKING_LINK_LIMIT_PER_USER = 10;
export const BOOKING_QUESTION_LIMIT = 8;
export const BOOKING_MAX_DURATION_MINUTES = 480;
export const BOOKING_MAX_HORIZON_DAYS = 90;
export const BOOKING_MAX_NOTICE_MINUTES = 14 * 24 * 60;
export const BOOKING_OPEN_PER_EMAIL = 3;
export const BOOKING_PER_VISITOR_PER_HOUR = 10;
export const BOOKING_PER_LINK_PER_DAY = 50;
export const BOOKING_ANSWER_MAX_CHARS = 2000;
export const BOOKING_HOST_LIMIT = 10;
export const BOOKING_CANCEL_REASON_MAX_CHARS = 500;
export const BOOKING_UPCOMING_LIST_LIMIT = 50;
export const BOOKING_REMINDER_LEAD_MS = 24 * 60 * 60 * 1000;
export const BOOKING_ASSIGNMENTS = ["single", "roundRobin"] as const;
export type BookingAssignmentKind = (typeof BOOKING_ASSIGNMENTS)[number];

export const BookingQuestionSchema = z
  .object({
    fieldId: z.uuid().describe("A field of the booking list. The visitor's answer is stored in it."),
    label: z.string().trim().min(1).max(200).optional().describe("Shown to the visitor; the field name by default."),
    required: z.boolean().default(false),
  })
  .strict();
export type BookingQuestion = z.infer<typeof BookingQuestionSchema>;

const LinkFieldsSchema = z.object({
  calendarId: z
    .uuid()
    .describe(
      "A writable calendar from the meeting options. Booked meetings are created in it and its busy time hides slots.",
    ),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable(),
  durationMinutes: z.number().int().min(5).max(BOOKING_MAX_DURATION_MINUTES),
  bufferMinutes: z.number().int().min(0).max(120).describe("Free time kept before and after every booked meeting."),
  minNoticeMinutes: z
    .number()
    .int()
    .min(0)
    .max(BOOKING_MAX_NOTICE_MINUTES)
    .describe("How far ahead a visitor must book, in minutes."),
  horizonDays: z.number().int().min(1).max(BOOKING_MAX_HORIZON_DAYS).describe("How many days ahead slots are offered."),
  timeZone: TimeZoneSchema.describe("Time zone of the working hours."),
  workingHours: WorkingHoursSchema,
  withVideo: z
    .boolean()
    .describe("Ask the provider for a video link: Google Meet on Google, Microsoft Teams on Outlook."),
  personTypeId: z
    .uuid()
    .nullable()
    .describe(
      "The list whose record is found or created for the visitor, one per email. It needs a contact details field.",
    ),
  personRelationshipId: z
    .uuid()
    .nullable()
    .describe(
      "The relationship between the booking list and the person list that links each booking record to the visitor's person. Null links nothing.",
    ),
  recordTypeId: z
    .uuid()
    .nullable()
    .describe("The list that receives one record per booking, for example the Actions list. Null stores no record."),
  startFieldId: z
    .uuid()
    .nullable()
    .describe("A date or date and time field of the booking list that is set to the start of the meeting."),
  questions: z.array(BookingQuestionSchema).max(BOOKING_QUESTION_LIMIT),
  successMessage: z.string().trim().max(500).nullable().describe("Shown to the visitor after booking."),
  enabled: z.boolean(),
  assignment: z
    .enum(BOOKING_ASSIGNMENTS)
    .describe(
      "single books the owner of the page. roundRobin offers a time when at least one host is free and books the free host with the fewest upcoming bookings of this page.",
    ),
  inviteeChanges: z
    .boolean()
    .describe("Whether the visitor may cancel or move the booking through the private link they receive."),
});

const HostUserIdsSchema = z
  .array(z.uuid())
  .max(BOOKING_HOST_LIMIT - 1)
  .describe(
    "Further members who host a roundRobin page besides its owner. Each needs a connected calendar that can be written; meetings go to their first such calendar. Only an administrator may name other members.",
  );

export const BookingHostSchema = z.object({
  userId: z.uuid(),
  name: z.string(),
  calendarName: z.string().nullable().describe("Null when this host has no usable calendar; the host is then skipped."),
});
export type BookingHostDto = z.infer<typeof BookingHostSchema>;

export const SaveBookingLinkSchema = LinkFieldsSchema.partial()
  .extend({
    id: z.uuid().optional().describe("Omit to create a booking link; send it to change one."),
    hostUserIds: HostUserIdsSchema.optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.id) return;
    for (const key of ["calendarId", "title", "durationMinutes", "timeZone"] as const) {
      if (data[key] === undefined)
        ctx.addIssue({ code: "custom", message: "Required to create a booking link", path: [key] });
    }
  });
export type SaveBookingLinkData = z.infer<typeof SaveBookingLinkSchema>;
export type SaveBookingLinkInput = z.input<typeof SaveBookingLinkSchema>;

export const BookingLinkIdSchema = z.object({ id: z.uuid() }).strict();
export type BookingLinkIdData = z.infer<typeof BookingLinkIdSchema>;

export const BookingLinkSchema = LinkFieldsSchema.extend({
  id: z.uuid(),
  calendarId: z
    .uuid()
    .nullable()
    .describe(
      "Null when the calendar is gone, for example after its account was disconnected. Visitors then see the page as unavailable until the owner chooses a calendar; bookings already made stay.",
    ),
  token: z.string(),
  url: z.string(),
  calendarName: z.string().nullable(),
  hosts: z.array(BookingHostSchema).describe("The further hosts of a roundRobin page, without its owner."),
  upcomingBookings: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type BookingLinkDto = z.infer<typeof BookingLinkSchema>;

export const BookingLinkListSchema = z.object({ items: z.array(BookingLinkSchema) });
export type BookingLinkList = z.infer<typeof BookingLinkListSchema>;

export const WorkspaceBookingLinkSchema = BookingLinkSchema.extend({
  ownerName: z.string(),
  own: z.boolean(),
});
export type WorkspaceBookingLinkDto = z.infer<typeof WorkspaceBookingLinkSchema>;

export const WorkspaceBookingLinkListSchema = z.object({
  items: z.array(WorkspaceBookingLinkSchema),
  hostCandidates: z
    .array(z.object({ userId: z.uuid(), name: z.string() }))
    .describe(
      "The other members who can host a roundRobin page: each has a connected calendar. Empty unless the caller is an administrator.",
    ),
  busyTimeIncomplete: z
    .boolean()
    .describe(
      "True when the caller's calendar could not be read in full for the days the caller's pages offer; those days offer no times.",
    ),
});
export type WorkspaceBookingLinkList = z.infer<typeof WorkspaceBookingLinkListSchema>;

export const UpcomingBookingSchema = z.object({
  id: z.uuid(),
  bookingLinkId: z.uuid(),
  pageTitle: z.string(),
  inviteeName: z.string(),
  inviteeEmail: z.string(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  hostUserId: z.uuid(),
  hostName: z.string(),
  calendarEventId: z.uuid().nullable().describe("The calendar event of the meeting; cancel it to cancel the booking."),
  recordTypeId: z.uuid().nullable(),
  recordId: z.uuid().nullable(),
});
export type UpcomingBookingDto = z.infer<typeof UpcomingBookingSchema>;

export const UpcomingBookingListSchema = z.object({ items: z.array(UpcomingBookingSchema) });
export type UpcomingBookingList = z.infer<typeof UpcomingBookingListSchema>;

export const CancelHostedBookingSchema = z
  .object({
    id: z.uuid().describe("An upcoming booking from the upcoming bookings list."),
    reason: z
      .string()
      .trim()
      .max(BOOKING_CANCEL_REASON_MAX_CHARS)
      .default("")
      .describe("Shown to the visitor in the cancellation email; empty sends none."),
  })
  .strict();
export type CancelHostedBookingData = z.infer<typeof CancelHostedBookingSchema>;
export type CancelHostedBookingInput = z.input<typeof CancelHostedBookingSchema>;

export const RescheduleHostedBookingSchema = z
  .object({
    id: z.uuid(),
    startsAt: z.iso.datetime({ offset: true }).describe("A free time from the booking's slots."),
  })
  .strict();
export type RescheduleHostedBookingData = z.infer<typeof RescheduleHostedBookingSchema>;

export const HostedBookingSlotsQuerySchema = z
  .object({
    id: z.uuid(),
    from: z.iso.datetime({ offset: true }).optional(),
    days: z.number().int().min(1).max(31).default(14),
  })
  .strict();
export type HostedBookingSlotsQuery = z.infer<typeof HostedBookingSlotsQuerySchema>;
export type HostedBookingSlotsQueryInput = z.input<typeof HostedBookingSlotsQuerySchema>;

export const HostedBookingSlotsSchema = z.object({
  timeZone: z.string(),
  slots: z.array(z.object({ startsAt: z.iso.datetime(), endsAt: z.iso.datetime() })),
  nextFrom: z.iso.datetime().nullable(),
});
export type HostedBookingSlots = z.infer<typeof HostedBookingSlotsSchema>;

export const HostedBookingChangeSchema = z.object({
  id: z.uuid(),
  status: z.enum(["cancelled", "rescheduled"]),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});
export type HostedBookingChange = z.infer<typeof HostedBookingChangeSchema>;

export const DeleteBookingLinkResultSchema = z.object({ id: z.uuid(), deleted: z.literal(true) });
export type DeleteBookingLinkResult = z.infer<typeof DeleteBookingLinkResultSchema>;

export type BookingLinkRow = {
  id: string;
  companyId: string;
  userId: string;
  calendarId: string | null;
  calendarName: string | null;
  token: string;
  title: string;
  description: string | null;
  durationMinutes: number;
  bufferMinutes: number;
  minNoticeMinutes: number;
  horizonDays: number;
  timeZone: string;
  workingHours: unknown;
  withVideo: boolean;
  personTypeId: string | null;
  personRelationshipId: string | null;
  recordTypeId: string | null;
  startFieldId: string | null;
  questions: unknown;
  successMessage: string | null;
  enabled: boolean;
  assignment: BookingAssignmentKind;
  inviteeChanges: boolean;
  hosts: BookingHostDto[];
  createdAt: Date;
  upcomingBookings: number;
};

export type WorkspaceBookingLinkRow = BookingLinkRow & { ownerName: string };

export const PublicAnswerValueSchema = z.union([
  z.string().max(BOOKING_ANSWER_MAX_CHARS),
  z.boolean(),
  z.array(z.string().max(200)).max(100),
]);

export const PublicBookingQuerySchema = z
  .object({
    token: z
      .string()
      .min(16)
      .max(64)
      .regex(/^[A-Za-z0-9_-]+$/),
    visitor: z.string().max(64).nullish(),
  })
  .strict();
export type PublicBookingQuery = z.infer<typeof PublicBookingQuerySchema>;

const ManageTokenSchema = z
  .string()
  .min(16)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const PublicBookingSlotsQuerySchema = PublicBookingQuerySchema.extend({
  from: z.iso.datetime({ offset: true }).optional(),
  days: z.number().int().min(1).max(31).default(14),
}).strict();

export const PublicBookingManageQuerySchema = z
  .object({ manageToken: ManageTokenSchema, visitor: z.string().max(64).nullish() })
  .strict();
export type PublicBookingManageQuery = z.infer<typeof PublicBookingManageQuerySchema>;

export const PublicBookingManageSlotsQuerySchema = PublicBookingManageQuerySchema.extend({
  from: z.iso.datetime({ offset: true }).optional(),
  days: z.number().int().min(1).max(31).default(14),
}).strict();

export const CancelPublicBookingSchema = PublicBookingManageQuerySchema.extend({
  reason: z.string().trim().max(BOOKING_CANCEL_REASON_MAX_CHARS).default(""),
}).strict();
export type CancelPublicBookingInput = z.input<typeof CancelPublicBookingSchema>;

export const ReschedulePublicBookingSchema = PublicBookingManageQuerySchema.extend({
  startsAt: z.iso.datetime({ offset: true }),
  timeZone: TimeZoneSchema,
}).strict();
export type ReschedulePublicBookingInput = z.input<typeof ReschedulePublicBookingSchema>;
export type PublicBookingSlotsQuery = z.infer<typeof PublicBookingSlotsQuerySchema>;

export const SubmitPublicBookingSchema = PublicBookingQuerySchema.extend({
  startsAt: z.iso.datetime({ offset: true }),
  name: z.string().trim().min(1).max(200),
  email: z
    .email()
    .max(320)
    .transform((email) => email.toLowerCase()),
  timeZone: TimeZoneSchema,
  answers: z.record(z.uuid(), PublicAnswerValueSchema).default({}),
  website: z.string().max(200).default(""),
  renderToken: z.string().max(200),
  locale: z.string().max(8).nullish(),
}).strict();
export type SubmitPublicBookingData = z.infer<typeof SubmitPublicBookingSchema>;
export type SubmitPublicBookingInput = z.input<typeof SubmitPublicBookingSchema>;

export type PublicQuestion = AnswerQuestion;

export type PublicBookingPage = {
  title: string;
  description: string | null;
  durationMinutes: number;
  horizonDays: number;
  timeZone: string;
  workspaceName: string | null;
  hostName: string;
  team: boolean;
  withVideo: boolean;
  questions: PublicQuestion[];
  renderToken: string;
  brand: WorkspaceBrand | null;
};

export type PublicBookingState = "upcoming" | "past" | "cancelled";

export type PublicManagedBooking = {
  title: string;
  hostName: string;
  workspaceName: string | null;
  inviteeName: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  horizonDays: number;
  state: PublicBookingState;
  cancelledByHost: boolean;
  cancelReason: string | null;
  canCancel: boolean;
  canReschedule: boolean;
  bookAgainToken: string | null;
  brand: WorkspaceBrand | null;
};

export type PublicBookingManageResult = { status: "found"; booking: PublicManagedBooking } | PublicBlocked;

export type PublicBookingCancelResult = { status: "cancelled" } | { status: "notAllowed" } | PublicBlocked;

export type PublicBookingRescheduleResult =
  | { status: "rescheduled"; startsAt: string; endsAt: string }
  | { status: "slotTaken" }
  | { status: "notAllowed" }
  | PublicBlocked;

export type PublicBookingPageResult = { status: "available"; page: PublicBookingPage } | PublicBlocked;

export type PublicBookingSlotsResult =
  | {
      status: "available";
      timeZone: string;
      slots: Array<{ startsAt: string; endsAt: string }>;
      nextFrom: string | null;
    }
  | PublicBlocked;

export type PublicBookingSubmitResult =
  | {
      status: "booked";
      startsAt: string;
      endsAt: string;
      conferenceUrl: string | null;
      title: string;
      hostName: string;
      manageUrl: string | null;
      successMessage: string | null;
    }
  | { status: "slotTaken" }
  | { status: "invalid"; fields: string[] }
  | PublicBlocked;
