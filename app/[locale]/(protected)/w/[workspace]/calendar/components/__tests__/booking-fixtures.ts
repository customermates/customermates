import type { WorkspaceBookingLinkDto } from "@/ee/calendar/booking.schema";
import type { BookingSetup } from "@/ee/calendar/booking-setup";
import type { BookingLinkForm } from "../../../settings/(account)/components/booking-link-modal.store";

import { DEFAULT_WORKING_HOURS } from "@/ee/calendar/working-hours";

export function bookingLink(overrides: Partial<WorkspaceBookingLinkDto> = {}): WorkspaceBookingLinkDto {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    token: "tok_abcdefghijklmnop",
    url: "https://app.example.com/book/tok_abcdefghijklmnop",
    calendarId: "10000000-0000-4000-8000-000000000001",
    calendarName: "Work",
    title: "Intro call",
    description: null,
    durationMinutes: 30,
    bufferMinutes: 0,
    minNoticeMinutes: 240,
    horizonDays: 30,
    timeZone: "Europe/Berlin",
    workingHours: DEFAULT_WORKING_HOURS,
    withVideo: false,
    personTypeId: null,
    personRelationshipId: null,
    recordTypeId: null,
    startFieldId: null,
    questions: [],
    successMessage: null,
    enabled: true,
    upcomingBookings: 0,
    createdAt: "2026-11-12T10:00:00.000Z",
    ownerName: "Test User",
    own: true,
    ...overrides,
  };
}

export function bookingForm(overrides: Partial<BookingLinkForm> = {}): BookingLinkForm {
  return {
    id: "",
    title: "Intro call",
    description: "",
    calendarId: "10000000-0000-4000-8000-000000000001",
    durationMinutes: 30,
    bufferMinutes: 0,
    minNoticeMinutes: 0,
    horizonDays: 30,
    timeZone: "UTC",
    workingHours: structuredClone(DEFAULT_WORKING_HOURS),
    withVideo: false,
    personTypeId: "",
    personRelationshipId: "",
    recordTypeId: "",
    startFieldId: "",
    questions: [],
    successMessage: "",
    enabled: true,
    ...overrides,
  };
}

export const READY_SETUP: BookingSetup = {
  calendars: [],
  lists: [],
  relationships: [],
  blockedReason: null,
};
