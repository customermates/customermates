import { z } from "zod";

import { TimeZoneSchema } from "@/core/utils/time-zone";

import { WorkingHoursSchema } from "./working-hours";

export const BOOKING_LINK_LIMIT_PER_USER = 10;
export const BOOKING_QUESTION_LIMIT = 8;
export const BOOKING_MAX_DURATION_MINUTES = 480;
export const BOOKING_MAX_HORIZON_DAYS = 90;
export const BOOKING_MAX_NOTICE_MINUTES = 14 * 24 * 60;
export const BOOKING_OPEN_PER_EMAIL = 3;
export const BOOKING_ANSWER_MAX_CHARS = 2000;

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
    .describe("A writable calendar from the meeting options. Booked meetings are created in it and its busy time hides slots."),
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
  withVideo: z.boolean().describe("Ask the provider for a video link: Google Meet on Google, Microsoft Teams on Outlook."),
  personTypeId: z
    .uuid()
    .nullable()
    .describe("The list whose record is found or created for the visitor, one per email. It needs a contact details field."),
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
});

export const SaveBookingLinkSchema = LinkFieldsSchema.partial()
  .extend({
    id: z.uuid().optional().describe("Omit to create a booking link; send it to change one."),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.id) return;
    for (const key of ["calendarId", "title", "durationMinutes", "timeZone"] as const)
      if (data[key] === undefined) ctx.addIssue({ code: "custom", message: "Required to create a booking link", path: [key] });
  });
export type SaveBookingLinkData = z.infer<typeof SaveBookingLinkSchema>;
export type SaveBookingLinkInput = z.input<typeof SaveBookingLinkSchema>;

export const BookingLinkIdSchema = z.object({ id: z.uuid() }).strict();
export type BookingLinkIdData = z.infer<typeof BookingLinkIdSchema>;

export const BookingLinkSchema = LinkFieldsSchema.extend({
  id: z.uuid(),
  token: z.string(),
  url: z.string(),
  calendarName: z.string().nullable(),
  upcomingBookings: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
});
export type BookingLinkDto = z.infer<typeof BookingLinkSchema>;

export const BookingLinkListSchema = z.object({ items: z.array(BookingLinkSchema) });
export type BookingLinkList = z.infer<typeof BookingLinkListSchema>;

export const DeleteBookingLinkResultSchema = z.object({ id: z.uuid(), deleted: z.literal(true) });
export type DeleteBookingLinkResult = z.infer<typeof DeleteBookingLinkResultSchema>;

export type BookingLinkRow = {
  id: string;
  companyId: string;
  userId: string;
  calendarId: string;
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
  recordTypeId: string | null;
  startFieldId: string | null;
  questions: unknown;
  successMessage: string | null;
  enabled: boolean;
  createdAt: Date;
  upcomingBookings: number;
};

export const PublicAnswerValueSchema = z.union([z.string().max(BOOKING_ANSWER_MAX_CHARS), z.number().finite(), z.boolean()]);

export const PublicBookingQuerySchema = z
  .object({
    token: z.string().min(16).max(64).regex(/^[A-Za-z0-9_-]+$/),
    visitor: z.string().max(64).nullish(),
  })
  .strict();
export type PublicBookingQuery = z.infer<typeof PublicBookingQuerySchema>;

export const PublicBookingSlotsQuerySchema = PublicBookingQuerySchema.extend({
  from: z.iso.datetime({ offset: true }).optional(),
  days: z.number().int().min(1).max(31).default(14),
}).strict();
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
}).strict();
export type SubmitPublicBookingData = z.infer<typeof SubmitPublicBookingSchema>;
export type SubmitPublicBookingInput = z.input<typeof SubmitPublicBookingSchema>;

export type PublicQuestion = {
  fieldId: string;
  label: string;
  kind: "text" | "url" | "select" | "number" | "boolean" | "date";
  required: boolean;
  options: Array<{ id: string; label: string }>;
};

export type PublicBookingPage = {
  title: string;
  description: string | null;
  durationMinutes: number;
  timeZone: string;
  workspaceName: string | null;
  hostName: string;
  withVideo: boolean;
  questions: PublicQuestion[];
};

export type PublicBookingBlocked = { status: "unavailable" } | { status: "rateLimited"; retryAfterSeconds: number };

export type PublicBookingPageResult = { status: "available"; page: PublicBookingPage } | PublicBookingBlocked;

export type PublicBookingSlotsResult =
  | { status: "available"; timeZone: string; slots: Array<{ startsAt: string; endsAt: string }> }
  | PublicBookingBlocked;

export type PublicBookingSubmitResult =
  | {
      status: "booked";
      startsAt: string;
      endsAt: string;
      conferenceUrl: string | null;
      title: string;
      successMessage: string | null;
    }
  | { status: "slotTaken" }
  | { status: "invalid"; fields: string[] }
  | PublicBookingBlocked;
