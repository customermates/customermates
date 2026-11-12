import { z } from "zod";

import type { McpTool } from "./mcp-tool";

import {
  getCancelMeetingInteractor,
  getDeleteBookingLinkInteractor,
  getGetBookingLinkByIdInteractor,
  getGetBookingLinksInteractor,
  getGetFreeSlotsInteractor,
  getGetMeetingOptionsInteractor,
  getSaveBookingLinkInteractor,
  getScheduleMeetingInteractor,
  getUpdateMeetingInteractor,
} from "@/core/di";
import { BookingLinkSchema, SaveBookingLinkSchema } from "@/ee/calendar/booking.schema";
import {
  FreeSlotsSchema,
  MeetingActionListSchema,
  MeetingAttendeeSuggestionSchema,
  MeetingSchema,
  ScheduleMeetingSchema,
  UpdateMeetingSchema,
  WritableCalendarSchema,
} from "@/ee/calendar/meeting.schema";
import { RecordRefSchema } from "@/features/records/record-model.schema";

import { mcpValidationFailure, runInteractor, toonResult } from "./utils";

const SCHEDULE_ACTIONS = ["options", "slots", "create", "update", "cancel"] as const;

const ScheduleMeetingToolSchema = z
  .object({
    action: z
      .enum(SCHEDULE_ACTIONS)
      .describe(
        "options: record; slots: durationMinutes, timeZone, from, days, workingHours, bufferMinutes; create: title, startsAt, durationMinutes, timeZone, calendarId, description, location, attendees, videoLink, sendInvites, records, followUp; update: id, title, startsAt, durationMinutes, timeZone, description, location, attendees, sendInvites; cancel: id, comment.",
      ),
    record: RecordRefSchema.optional().describe(
      "options only: the record the meeting is for, to get attendee suggestions from its linked People.",
    ),
    id: UpdateMeetingSchema.shape.id.optional(),
    calendarId: ScheduleMeetingSchema.shape.calendarId,
    title: ScheduleMeetingSchema.shape.title.optional(),
    description: ScheduleMeetingSchema.shape.description,
    location: ScheduleMeetingSchema.shape.location,
    startsAt: UpdateMeetingSchema.shape.startsAt,
    durationMinutes: UpdateMeetingSchema.shape.durationMinutes,
    timeZone: UpdateMeetingSchema.shape.timeZone,
    attendees: UpdateMeetingSchema.shape.attendees,
    videoLink: ScheduleMeetingSchema.shape.videoLink.optional(),
    sendInvites: UpdateMeetingSchema.shape.sendInvites.optional(),
    records: ScheduleMeetingSchema.shape.records.optional(),
    followUp: ScheduleMeetingSchema.shape.followUp,
    from: z.iso.datetime({ offset: true }).optional().describe("slots only: the first instant to consider."),
    days: z.number().int().min(1).max(30).optional().describe("slots only: how many days to search, 14 by default."),
    workingHours: z
      .unknown()
      .optional()
      .describe(
        "slots only: bookable windows per weekday as { monday: [{ start: '09:00', end: '17:00' }], ... }; Monday to Friday 09:00 to 17:00 by default.",
      ),
    bufferMinutes: z.number().int().min(0).max(120).optional().describe("slots only: free time kept around busy time."),
    comment: z.string().max(1000).optional().describe("cancel only: a message to the attendees, shown by Outlook."),
  })
  .strict();

const ScheduleMeetingOutputSchema = z
  .object({
    action: z.enum(SCHEDULE_ACTIONS),
    calendars: z.array(WritableCalendarSchema).optional(),
    attendees: z.array(MeetingAttendeeSuggestionSchema).optional(),
    actionLists: z.array(MeetingActionListSchema).optional(),
    blockedReason: z.enum(["noCalendar", "needsReconnect"]).nullable().optional(),
    timeZone: FreeSlotsSchema.shape.timeZone.optional(),
    slots: FreeSlotsSchema.shape.slots.optional(),
    meeting: MeetingSchema.optional(),
    cancelled: z.object({ id: z.uuid(), status: z.literal("cancelled") }).optional(),
  })
  .strict();

export const scheduleMeetingTool = {
  name: "schedule_meeting",
  title: "Schedule, move and cancel meetings",
  description:
    "Creates, moves and cancels meetings in the caller's own connected Google or Microsoft calendar, and finds free slots from the synced calendars. Needs the inbox plan (Pro and up) and a connected calendar; it is not available when self-hosting. " +
    "Call options first for the writable calendars, attendee suggestions from a record and its linked People, and the lists that can receive a follow-up Action. " +
    "slots returns free start times within working hours that do not overlap synced events. create makes the event, links it to the given records so it appears on their activity timeline, and with followUp also creates a record in that list at the meeting start. " +
    "SIDE EFFECT: create, update and cancel change a real calendar, and unless sendInvites is false the provider sends invitations or updates to every attendee. Confirm title, time, time zone and attendees with the user before calling create or update. " +
    "cancel notifies the attendees and cancels the event permanently for them. Only events created through this tool or the app and owned by the caller can be changed; event ids come from create or from get_calendars.",
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: true,
    openWorldHint: true,
  },
  inputSchema: ScheduleMeetingToolSchema,
  outputSchema: ScheduleMeetingOutputSchema,
  execute: (input: unknown) => {
    const parsed = ScheduleMeetingToolSchema.safeParse(input);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    const { action, record, comment, from, days, workingHours, bufferMinutes, ...fields } = parsed.data;

    if (action === "options") {
      return runInteractor(getGetMeetingOptionsInteractor().invoke({ ...(record ? { record } : {}) }), (data) =>
        toonResult({ action, ...data }),
      );
    }
    if (action === "slots") {
      return runInteractor(
        getGetFreeSlotsInteractor().invoke({
          durationMinutes: fields.durationMinutes,
          timeZone: fields.timeZone,
          from,
          days,
          workingHours,
          bufferMinutes,
        } as never),
        (data) => toonResult({ action, ...data }),
      );
    }
    if (action === "create") {
      return runInteractor(getScheduleMeetingInteractor().invoke(fields as never), (meeting) =>
        toonResult({ action, meeting }),
      );
    }
    if (action === "update") {
      return runInteractor(getUpdateMeetingInteractor().invoke(updateFields(fields) as never), (meeting) =>
        toonResult({ action, meeting }),
      );
    }

    return runInteractor(getCancelMeetingInteractor().invoke({ id: fields.id, comment } as never), (cancelled) =>
      toonResult({ action, cancelled }),
    );
  },
} satisfies McpTool;

function updateFields(fields: Record<string, unknown>) {
  return Object.fromEntries(
    ["id", "title", "description", "location", "startsAt", "durationMinutes", "timeZone", "attendees", "sendInvites"]
      .filter((key) => fields[key] !== undefined)
      .map((key) => [key, fields[key]]),
  );
}

const BOOKING_ACTIONS = ["list", "get", "save", "delete"] as const;

const ManageBookingLinksToolSchema = z
  .object({
    action: z
      .enum(BOOKING_ACTIONS)
      .describe(
        "list returns the caller's booking links; get: id; save: id, calendarId, title, description, durationMinutes, bufferMinutes, minNoticeMinutes, horizonDays, timeZone, workingHours, withVideo, personTypeId, recordTypeId, startFieldId, questions, successMessage, enabled; delete: id.",
      ),
    id: SaveBookingLinkSchema.shape.id.describe(
      "get, delete and save: the booking link; omit it on save to create a new link.",
    ),
    calendarId: z.uuid().optional(),
    title: z.string().optional(),
    description: z.string().nullable().optional(),
    durationMinutes: z.number().int().optional(),
    bufferMinutes: z.number().int().optional(),
    minNoticeMinutes: z.number().int().optional(),
    horizonDays: z.number().int().optional(),
    timeZone: z.string().optional(),
    workingHours: z.unknown().optional(),
    withVideo: z.boolean().optional(),
    personTypeId: z.uuid().nullable().optional(),
    recordTypeId: z.uuid().nullable().optional(),
    startFieldId: z.uuid().nullable().optional(),
    questions: z.array(z.unknown()).optional(),
    successMessage: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
  })
  .strict();

const ManageBookingLinksOutputSchema = z
  .object({
    action: z.enum(BOOKING_ACTIONS),
    items: z.array(BookingLinkSchema).optional(),
    bookingLink: BookingLinkSchema.optional(),
    deleted: z.object({ id: z.uuid(), deleted: z.literal(true) }).optional(),
  })
  .strict();

export const manageBookingLinksTool = {
  name: "manage_booking_links",
  title: "Manage public booking pages",
  description:
    "Lists, creates, changes and deletes the caller's public booking pages, a link where anyone can book a meeting in the caller's connected calendar without an account. Needs the inbox plan (Pro and up) and a connected calendar; it is not available when self-hosting. " +
    "A booking link carries the meeting duration, a buffer, minimum notice, how many days ahead slots are offered, working hours in a time zone, an optional video link and the visitor questions. " +
    "Each question is a field of recordTypeId, the list that receives one record per booking; personTypeId names the list whose record is found or created for the visitor, one per email. " +
    "Call schedule_meeting options for calendarId, and get_record_model for list and field ids. save with an id changes only the keys sent, and questions and workingHours replace the whole value. " +
    "The page shows free slots from the synced calendars and creates the calendar event, the Person and the record when someone books; every booking also emits the form.submitted event, so rules can react. " +
    "delete permanently removes the link and its booking history; meetings already booked stay in the calendar.",
  annotations: {
    readOnlyHint: false,
    idempotentHint: false,
    destructiveHint: true,
    openWorldHint: false,
  },
  inputSchema: ManageBookingLinksToolSchema,
  outputSchema: ManageBookingLinksOutputSchema,
  execute: (input: unknown) => {
    const parsed = ManageBookingLinksToolSchema.safeParse(input);
    if (!parsed.success) return mcpValidationFailure(parsed.error);
    const { action, id, ...fields } = parsed.data;

    if (action === "list") {
      return runInteractor(getGetBookingLinksInteractor().invoke(), (data) =>
        toonResult({ action, items: data.items }),
      );
    }
    if (action === "get") {
      return runInteractor(getGetBookingLinkByIdInteractor().invoke({ id: id as string }), (bookingLink) =>
        toonResult({ action, bookingLink }),
      );
    }
    if (action === "delete") {
      return runInteractor(getDeleteBookingLinkInteractor().invoke({ id: id as string }), (deleted) =>
        toonResult({ action, deleted }),
      );
    }

    return runInteractor(
      getSaveBookingLinkInteractor().invoke({ ...(id ? { id } : {}), ...fields } as never),
      (bookingLink) => toonResult({ action, bookingLink }),
    );
  },
} satisfies McpTool;
