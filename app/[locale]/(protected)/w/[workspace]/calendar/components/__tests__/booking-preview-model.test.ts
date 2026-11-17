import type { BookingLinkForm } from "../../../settings/(account)/components/booking-link-modal.store";
import type { BookingSetup } from "@/ee/calendar/booking-setup";

import { describe, expect, it } from "vitest";

import { DEFAULT_WORKING_HOURS } from "@/ee/calendar/working-hours";

import { bookingPreviewPage, bookingPreviewSlots } from "../booking/booking-preview-model";

const RECORD_LIST = "30000000-0000-4000-8000-000000000001";
const NOTE = "30000000-0000-4000-8000-000000000002";

const SETUP: BookingSetup = {
  calendars: [],
  relationships: [],
  blockedReason: null,
  lists: [
    {
      id: RECORD_LIST,
      label: "Actions",
      hasChannels: false,
      primaryFieldId: null,
      dateFields: [],
      questionFields: [
        {
          id: NOTE,
          label: "Note",
          question: {
            fieldId: NOTE,
            label: "Note",
            helpText: null,
            required: false,
            valueType: "text",
            multiple: false,
            options: [],
            currency: null,
          },
        },
      ],
    },
  ],
};

function form(overrides: Partial<BookingLinkForm> = {}): BookingLinkForm {
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

describe("booking preview page", () => {
  it("shows what the visitor reads: title, text, length, video and host", () => {
    const page = bookingPreviewPage(
      form({ description: "  Pick a time  ", durationMinutes: 45, withVideo: true }),
      SETUP,
      "Test User",
      "Your booking page",
    );

    expect(page).toMatchObject({
      title: "Intro call",
      description: "Pick a time",
      durationMinutes: 45,
      withVideo: true,
      hostName: "Test User",
      workspaceName: null,
      questions: [],
    });
  });

  it("falls back to the placeholder title while the title is empty", () => {
    expect(bookingPreviewPage(form({ title: "  " }), SETUP, "Test User", "Your booking page").title).toBe(
      "Your booking page",
    );
  });

  it("asks the questions of the chosen list with the label and required flag of the page", () => {
    const page = bookingPreviewPage(
      form({ recordTypeId: RECORD_LIST, questions: [{ fieldId: NOTE, label: "What is it about?", required: true }] }),
      SETUP,
      "Test User",
      "Your booking page",
    );

    expect(page.questions).toEqual([
      expect.objectContaining({ fieldId: NOTE, label: "What is it about?", required: true, valueType: "text" }),
    ]);
  });

  it("drops questions of a list that is not chosen or of a field that is gone", () => {
    const gone = form({ recordTypeId: RECORD_LIST, questions: [{ fieldId: "missing", required: false }] });
    const unchosen = form({ recordTypeId: "", questions: [{ fieldId: NOTE, required: false }] });

    expect(bookingPreviewPage(gone, SETUP, "Test User", "x").questions).toEqual([]);
    expect(bookingPreviewPage(unchosen, SETUP, "Test User", "x").questions).toEqual([]);
  });
});

describe("booking preview slots", () => {
  const monday = new Date("2026-11-16T06:00:00.000Z");

  it("offers the working hours of the next days in the page's time zone", () => {
    const slots = bookingPreviewSlots(form(), monday);

    expect(slots[0]).toEqual({ startsAt: "2026-11-16T09:00:00.000Z", endsAt: "2026-11-16T09:30:00.000Z" });
    expect(slots.every((slot) => new Date(slot.startsAt) < new Date("2026-11-30T06:00:00.000Z"))).toBe(true);
  });

  it("follows the length, the buffer and the closed days of the draft", () => {
    const workingHours = structuredClone(DEFAULT_WORKING_HOURS);
    workingHours.monday = [];
    const slots = bookingPreviewSlots(form({ durationMinutes: 60, workingHours }), monday);

    expect(slots[0].startsAt.startsWith("2026-11-17")).toBe(true);
    expect(new Date(slots[0].endsAt).getTime() - new Date(slots[0].startsAt).getTime()).toBe(60 * 60_000);
  });

  it("applies the minimum notice", () => {
    const slots = bookingPreviewSlots(form({ minNoticeMinutes: 1440 }), monday);

    expect(new Date(slots[0].startsAt).getTime()).toBeGreaterThanOrEqual(monday.getTime() + 1440 * 60_000);
  });

  it("shows no slots instead of failing while the time zone is empty or unknown", () => {
    expect(bookingPreviewSlots(form({ timeZone: "" }), monday)).toEqual([]);
    expect(bookingPreviewSlots(form({ timeZone: "Mars/Base" }), monday)).toEqual([]);
  });
});
