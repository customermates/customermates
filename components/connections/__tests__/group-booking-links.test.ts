import { describe, expect, it } from "vitest";

import type { BookingLinkDto } from "@/ee/calendar/booking.schema";

import { groupBookingLinksByCalendar } from "../group-booking-links";

function link(id: string, calendarName: string | null): BookingLinkDto {
  return { id, calendarName } as BookingLinkDto;
}

describe("groupBookingLinksByCalendar", () => {
  it("puts the booking pages of one calendar together in the order the calendars first appear", () => {
    const groups = groupBookingLinksByCalendar([
      link("a", "Work"),
      link("b", "Private"),
      link("c", "Work"),
      link("d", "Private"),
    ]);

    expect(groups.map((group) => [group.calendarName, group.links.map((entry) => entry.id)])).toEqual([
      ["Work", ["a", "c"]],
      ["Private", ["b", "d"]],
    ]);
  });

  it("lists booking pages without a calendar last", () => {
    const groups = groupBookingLinksByCalendar([link("a", null), link("b", "Work"), link("c", "  ")]);

    expect(groups.map((group) => [group.calendarName, group.links.map((entry) => entry.id)])).toEqual([
      ["Work", ["b"]],
      [null, ["a", "c"]],
    ]);
  });

  it("returns nothing for no booking pages", () => {
    expect(groupBookingLinksByCalendar([])).toEqual([]);
  });
});
