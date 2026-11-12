import { z } from "zod";

import { TimeZoneSchema } from "@/core/utils/time-zone";
import { RecordRefSchema } from "@/features/records/record-model.schema";
import { MessagingProviderSchema } from "@/ee/messaging/messaging.schema";

import { WorkingHoursSchema } from "./working-hours";

export const MEETING_MAX_ATTENDEES = 50;
export const MEETING_MAX_RECORDS = 10;
export const MEETING_MIN_MINUTES = 5;
export const MEETING_MAX_MINUTES = 1440;
export const MEETING_SLOT_DAYS_MAX = 30;

const EmailSchema = z
  .email()
  .max(320)
  .transform((email) => email.toLowerCase());

export const MeetingAttendeeInputSchema = z
  .object({
    email: EmailSchema,
    name: z.string().trim().max(200).optional(),
  })
  .strict();
export type MeetingAttendeeInput = z.infer<typeof MeetingAttendeeInputSchema>;

export const MeetingActionTargetSchema = z
  .object({
    typeId: z.uuid().describe("The list that receives the Action record."),
    dateFieldId: z
      .uuid()
      .describe("A date or date and time field of that list that is set to the start of the meeting."),
  })
  .strict();
export type MeetingActionTarget = z.infer<typeof MeetingActionTargetSchema>;

const MeetingTimingSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }).describe("Start of the meeting as an instant with offset or Z."),
  durationMinutes: z.number().int().min(MEETING_MIN_MINUTES).max(MEETING_MAX_MINUTES),
  timeZone: TimeZoneSchema.describe("IANA time zone the event is shown in, for example Europe/Berlin."),
});

export const ScheduleMeetingSchema = MeetingTimingSchema.extend({
  calendarId: z
    .uuid()
    .optional()
    .describe("A calendar from the meeting options; the first writable calendar of the caller when omitted."),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).optional(),
  location: z.string().max(500).optional(),
  attendees: z.array(MeetingAttendeeInputSchema).max(MEETING_MAX_ATTENDEES).default([]),
  videoLink: z
    .boolean()
    .default(false)
    .describe("Ask the provider for a video link: Google Meet on Google, Microsoft Teams on Outlook."),
  sendInvites: z.boolean().default(true).describe("Let the provider send the invitations to the attendees."),
  records: z
    .array(RecordRefSchema)
    .max(MEETING_MAX_RECORDS)
    .default([])
    .describe("Records the meeting belongs to. It appears on their activity timeline."),
  action: MeetingActionTargetSchema.optional().describe(
    "Creates a record in this list at the start of the meeting, linked to the records, as the follow-up Action.",
  ),
}).strict();
export type ScheduleMeetingData = z.infer<typeof ScheduleMeetingSchema>;
export type ScheduleMeetingInput = z.input<typeof ScheduleMeetingSchema>;

export const UpdateMeetingSchema = z
  .object({
    id: z.uuid().describe("The event id returned when the meeting was created."),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().max(5000).optional(),
    location: z.string().max(500).optional(),
    startsAt: MeetingTimingSchema.shape.startsAt.optional(),
    durationMinutes: MeetingTimingSchema.shape.durationMinutes.optional(),
    timeZone: MeetingTimingSchema.shape.timeZone.optional(),
    attendees: z.array(MeetingAttendeeInputSchema).max(MEETING_MAX_ATTENDEES).optional(),
    sendInvites: z.boolean().default(true),
  })
  .strict()
  .refine((data) => (data.startsAt === undefined) === (data.durationMinutes === undefined), {
    message: "Send startsAt and durationMinutes together to move a meeting",
    path: ["startsAt"],
  });
export type UpdateMeetingData = z.infer<typeof UpdateMeetingSchema>;
export type UpdateMeetingInput = z.input<typeof UpdateMeetingSchema>;

export const CancelMeetingSchema = z
  .object({
    id: z.uuid().describe("The event id returned when the meeting was created."),
    comment: z.string().trim().max(1000).optional().describe("A message to the attendees, shown by Outlook."),
  })
  .strict();
export type CancelMeetingData = z.infer<typeof CancelMeetingSchema>;

export const MeetingAttendeeSchema = z.object({
  email: z.string(),
  displayName: z.string().nullable(),
  responseStatus: z.string().nullable(),
});

export const MeetingSchema = z.object({
  id: z.uuid(),
  calendarId: z.uuid(),
  title: z.string(),
  description: z.string().nullable(),
  location: z.string().nullable(),
  conferenceUrl: z.string().nullable(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  timeZone: z.string().nullable(),
  status: z.enum(["confirmed", "cancelled"]),
  attendees: z.array(MeetingAttendeeSchema),
  records: z.array(RecordRefSchema),
  action: RecordRefSchema.nullable(),
  warnings: z
    .array(z.enum(["recordsNotLinked", "actionNotCreated"]))
    .describe("The meeting exists in the calendar; these follow-up steps did not complete."),
});
export type Meeting = z.infer<typeof MeetingSchema>;

export const CancelMeetingResultSchema = z.object({ id: z.uuid(), status: z.literal("cancelled") });
export type CancelMeetingResult = z.infer<typeof CancelMeetingResultSchema>;

export const MeetingOptionsQuerySchema = z
  .object({
    record: RecordRefSchema.optional().describe(
      "The record the meeting is for: its own and its linked People's email addresses are offered as attendees.",
    ),
  })
  .strict();
export type MeetingOptionsQuery = z.infer<typeof MeetingOptionsQuerySchema>;

export const WritableCalendarSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  provider: MessagingProviderSchema,
  timeZone: z.string().nullable(),
  accountLabel: z.string().nullable(),
});
export type WritableCalendar = z.infer<typeof WritableCalendarSchema>;

export const MeetingAttendeeSuggestionSchema = z.object({
  email: z.string(),
  name: z.string().nullable(),
  ref: RecordRefSchema,
});
export type MeetingAttendeeSuggestion = z.infer<typeof MeetingAttendeeSuggestionSchema>;

export const MeetingActionListSchema = z.object({
  typeId: z.uuid(),
  label: z.string(),
  dateFields: z.array(z.object({ id: z.uuid(), label: z.string(), valueType: z.enum(["date", "dateTime"]) })),
  linkableTypeIds: z.array(z.uuid()),
});
export type MeetingActionList = z.infer<typeof MeetingActionListSchema>;

export const MeetingOptionsSchema = z.object({
  calendars: z.array(WritableCalendarSchema),
  attendees: z.array(MeetingAttendeeSuggestionSchema),
  actionLists: z.array(MeetingActionListSchema),
  blockedReason: z.enum(["noCalendar", "needsReconnect"]).nullable(),
});
export type MeetingOptions = z.infer<typeof MeetingOptionsSchema>;

export const FreeSlotsQuerySchema = z
  .object({
    durationMinutes: MeetingTimingSchema.shape.durationMinutes,
    timeZone: MeetingTimingSchema.shape.timeZone,
    from: z.iso.datetime({ offset: true }).optional().describe("First instant to consider; now when omitted."),
    days: z.number().int().min(1).max(MEETING_SLOT_DAYS_MAX).default(14),
    workingHours: WorkingHoursSchema.optional().describe("Defaults to Monday to Friday, 09:00 to 17:00."),
    bufferMinutes: z.number().int().min(0).max(120).default(0),
  })
  .strict();
export type FreeSlotsQuery = z.infer<typeof FreeSlotsQuerySchema>;

export const FreeSlotsSchema = z.object({
  timeZone: z.string(),
  slots: z.array(z.object({ startsAt: z.iso.datetime(), endsAt: z.iso.datetime() })),
});
export type FreeSlots = z.infer<typeof FreeSlotsSchema>;
