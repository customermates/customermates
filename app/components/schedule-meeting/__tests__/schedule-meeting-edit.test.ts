import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/[locale]/(protected)/w/[workspace]/calendar/schedule-actions", () => ({
  freeSlotsAction: vi.fn(),
  meetingEventAction: vi.fn(),
  meetingOptionsAction: vi.fn(),
  scheduleMeetingAction: vi.fn(),
  updateMeetingAction: vi.fn(),
}));

import { eventForm, meetingChanges, type ScheduleMeetingForm } from "../schedule-meeting-modal.store";

const TIME_ZONE = "Europe/Berlin";

const EVENT = {
  title: "Onboarding call",
  description: null,
  location: "Zoom",
  startsAt: new Date("2026-11-26T13:00:00.000Z"),
  endsAt: "2026-11-26T13:50:00.000Z",
  attendees: [
    { email: "host@example.com", isOrganizer: true },
    { email: "guest@example.com", isOrganizer: false },
  ],
};

function form(overrides: Partial<ScheduleMeetingForm> = {}): ScheduleMeetingForm {
  return {
    title: "Onboarding call",
    description: "",
    location: "Zoom",
    date: "2026-11-26",
    endDate: "2026-11-26",
    scope: "occurrence",
    time: "14:00",
    durationMinutes: 50,
    calendarId: "",
    attendees: ["guest@example.com"],
    videoLink: false,
    sendInvites: true,
    followUpTypeId: "",
    followUpDateFieldId: "",
    ...overrides,
  };
}

describe("eventForm", () => {
  it("fills the form from a synced event in the planner time zone, without the organizer", () => {
    expect(eventForm(EVENT, TIME_ZONE)).toEqual({
      title: "Onboarding call",
      description: "",
      location: "Zoom",
      date: "2026-11-26",
      endDate: "2026-11-26",
      time: "14:00",
      durationMinutes: 50,
      attendees: ["guest@example.com"],
    });
  });

  it("fills an all-day event with its first and last day and no time", () => {
    const allDay = {
      ...EVENT,
      allDay: true,
      startsAt: "2026-11-26T00:00:00.000Z",
      endsAt: "2026-11-29T00:00:00.000Z",
    };
    expect(eventForm(allDay, TIME_ZONE)).toEqual({
      title: "Onboarding call",
      description: "",
      location: "Zoom",
      date: "2026-11-26",
      endDate: "2026-11-28",
      attendees: ["guest@example.com"],
    });
  });
});

describe("meetingChanges", () => {
  const startsAt = "2026-11-27T09:30:00.000Z";

  it("sends only sendInvites when nothing changed", () => {
    expect(meetingChanges(form(), form(), startsAt)).toEqual({ sendInvites: true });
  });

  it("sends the new start with the length when date, time or length change", () => {
    expect(meetingChanges(form({ date: "2026-11-27", time: "10:30" }), form(), startsAt)).toEqual({
      startsAt,
      durationMinutes: 50,
      sendInvites: true,
    });
    expect(meetingChanges(form({ durationMinutes: 30 }), form(), startsAt)).toMatchObject({
      startsAt,
      durationMinutes: 30,
    });
  });

  it("sends changed text fields and the full attendee list when it changes", () => {
    expect(
      meetingChanges(
        form({
          title: "Kick-off",
          description: "Agenda",
          location: "",
          attendees: ["guest@example.com", "new@example.com"],
          sendInvites: false,
        }),
        form(),
        startsAt,
      ),
    ).toEqual({
      title: "Kick-off",
      description: "Agenda",
      location: "",
      attendees: [{ email: "guest@example.com" }, { email: "new@example.com" }],
      sendInvites: false,
    });
  });

  it("sends the first and last day of an all-day event instead of a start time", () => {
    const shape = { allDay: true, recurring: false };
    expect(meetingChanges(form(), form(), startsAt, shape)).toEqual({ sendInvites: true });
    expect(meetingChanges(form({ date: "2026-11-28", endDate: "2026-11-29" }), form(), startsAt, shape)).toEqual({
      startDate: "2026-11-28",
      endDate: "2026-11-29",
      sendInvites: true,
    });
    expect(meetingChanges(form({ date: "2026-11-28" }), form(), startsAt, shape)).toMatchObject({
      startDate: "2026-11-28",
      endDate: "2026-11-28",
    });
  });

  it("sends the chosen scope only for an occurrence of a repeating meeting", () => {
    expect(
      meetingChanges(form({ title: "Weekly", scope: "series" }), form(), startsAt, { allDay: false, recurring: true }),
    ).toEqual({ title: "Weekly", sendInvites: true, scope: "series" });
    expect(meetingChanges(form({ scope: "series" }), form(), startsAt)).toEqual({ sendInvites: true });
  });

  it("treats the same attendees in another order as unchanged", () => {
    const saved = form({ attendees: ["a@example.com", "b@example.com"] });
    expect(meetingChanges(form({ attendees: ["b@example.com", "a@example.com"] }), saved, startsAt)).toEqual({
      sendInvites: true,
    });
  });
});
