import { describe, expect, it } from "vitest";

import type { BookingRow } from "../booking-reservation.repo";

import { bookingChangedPayload } from "../booking-announcer";
import { orderHostsForBooking } from "../booking-assignment";
import { mergeHostSlots } from "../booking-availability";
import { bookingInvitation, bookingManageUrl } from "../booking-invitation";

const slot = (hour: number) => ({
  startsAt: new Date(Date.UTC(2030, 0, 15, hour)).toISOString(),
  endsAt: new Date(Date.UTC(2030, 0, 15, hour, 30)).toISOString(),
});

describe("orderHostsForBooking", () => {
  it("prefers the free host with the fewest upcoming bookings", () => {
    const ordered = orderHostsForBooking(
      ["owner", "anna", "ben"],
      [
        { hostUserId: "owner", upcoming: 3, lastBookedAt: new Date("2030-01-01") },
        { hostUserId: "anna", upcoming: 1, lastBookedAt: new Date("2030-01-02") },
      ],
      ["owner", "anna", "ben"],
    );

    expect(ordered).toEqual(["ben", "anna", "owner"]);
  });

  it("breaks a tie by who was booked longest ago, then by the order of the page", () => {
    const loads = [
      { hostUserId: "owner", upcoming: 2, lastBookedAt: new Date("2030-01-05") },
      { hostUserId: "anna", upcoming: 2, lastBookedAt: new Date("2030-01-03") },
    ];

    expect(orderHostsForBooking(["owner", "anna"], loads, ["owner", "anna"])).toEqual(["anna", "owner"]);
    expect(orderHostsForBooking(["ben", "anna"], [], ["anna", "ben"])).toEqual(["anna", "ben"]);
  });

  it("never returns a host that is not free", () => {
    expect(orderHostsForBooking(["anna"], [{ hostUserId: "owner", upcoming: 0, lastBookedAt: null }], [])).toEqual([
      "anna",
    ]);
  });
});

describe("mergeHostSlots", () => {
  const end = new Date(Date.UTC(2030, 0, 16));

  it("offers a time once when any host is free and keeps the times in order", () => {
    const merged = mergeHostSlots([[slot(9), slot(11)], [slot(10), slot(11)]], end, 500);

    expect(merged.slots.map((item) => item.startsAt)).toEqual([slot(9).startsAt, slot(10).startsAt, slot(11).startsAt]);
    expect(merged.covered.getTime()).toBe(end.getTime() + 1);
  });

  it("stops at the first time a host could not report in full, so no later time is missed", () => {
    const merged = mergeHostSlots([[slot(9), slot(10), slot(11)], [slot(9), slot(12), slot(13)]], end, 2);

    expect(merged.slots.map((item) => item.startsAt)).toEqual([slot(9).startsAt, slot(10).startsAt]);
    expect(merged.covered.toISOString()).toBe(slot(11).startsAt);
  });

  it("cuts the merged list at the limit and continues from the cut", () => {
    const merged = mergeHostSlots([[slot(9), slot(11)], [slot(10)]], end, 2);

    expect(merged.slots).toHaveLength(2);
    expect(merged.covered.toISOString()).toBe(slot(11).startsAt);
  });
});

describe("booking invitation and change payload", () => {
  it("adds the private link to the invitation when the visitor may change the booking", () => {
    const url = bookingManageUrl("https://app.example/", "tok_1234567890abcdef");
    const invitation = bookingInvitation("Intro call", "Vera Visitor", "vera@example.com", {
      line: "Cancel or reschedule:",
      url,
    });

    expect(url).toBe("https://app.example/book/manage/tok_1234567890abcdef");
    expect(invitation.title).toBe("Intro call - Vera Visitor");
    expect(invitation.description).toBe(`Vera Visitor <vera@example.com>\n\nCancel or reschedule: ${url}`);
    expect(bookingInvitation("Intro call", "Vera", "vera@example.com").description).toBe("Vera <vera@example.com>");
  });

  it("describes a cancelled booking for automations and webhooks", () => {
    const booking = {
      id: "b1",
      companyId: "co1",
      bookingLinkId: "l1",
      linkTitle: "Intro call",
      recordTypeId: "t-booking",
      recordId: "r-booking",
      personTypeId: "t-person",
      personRecordId: "r-person",
      hostUserId: "u1",
      inviteeName: "Vera",
      inviteeEmail: "vera@example.com",
      startsAt: new Date("2030-01-15T09:00:00.000Z"),
      endsAt: new Date("2030-01-15T09:30:00.000Z"),
      timeZone: "Europe/Berlin",
      answers: { Topic: "Pricing" },
    } as BookingRow;

    expect(bookingChangedPayload(booking, "cancelled", "invitee", { reason: "Ill" })).toEqual({
      bookingId: "b1",
      bookingLinkId: "l1",
      bookingLinkName: "Intro call",
      change: "cancelled",
      by: "invitee",
      typeId: "t-booking",
      recordId: "r-booking",
      personRecordId: "r-person",
      hostUserId: "u1",
      answers: {
        Topic: "Pricing",
        name: "Vera",
        email: "vera@example.com",
        startsAt: "2030-01-15T09:00:00.000Z",
        endsAt: "2030-01-15T09:30:00.000Z",
        timeZone: "Europe/Berlin",
        reason: "Ill",
      },
    });
    expect(
      bookingChangedPayload({ ...booking, recordTypeId: null, recordId: null }, "rescheduled", "host", {
        previousStartsAt: new Date("2030-01-14T09:00:00.000Z"),
      }),
    ).toMatchObject({
      typeId: "t-person",
      recordId: "r-person",
      answers: { previousStartsAt: "2030-01-14T09:00:00.000Z" },
    });
  });
});
