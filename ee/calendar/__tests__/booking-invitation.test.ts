import { describe, expect, it } from "vitest";

import { bookingInvitation, invitationName } from "../booking-invitation";

describe("the name a booking invitation carries", () => {
  it("leaves an ordinary name as the visitor typed it", () => {
    expect(invitationName("Zoë O'Brien-Müller")).toBe("Zoë O'Brien-Müller");
    expect(invitationName("Dr. Grace Hopper Jr.")).toBe("Dr. Grace Hopper Jr.");
    expect(invitationName("  Ada   Lovelace ")).toBe("Ada Lovelace");
  });

  it("removes addresses with a scheme or a www prefix and breaks what a mail program would turn into a link", () => {
    expect(invitationName("Ada https://evil.example/win now")).toBe("Ada now");
    expect(invitationName("Ada HTTP://EVIL.EXAMPLE")).toBe("Ada");
    expect(invitationName("Ada www.evil.example/win")).toBe("Ada");
    expect(invitationName("Ada evil.example/win")).toBe("Ada evil example win");
    expect(invitationName("pay@evil.example")).toBe("pay evil example");
    expect(invitationName("[Ada](javascript://x) <b>")).toBe("Ada b");
  });

  it("removes control characters and keeps the name short", () => {
    expect(invitationName("Ada\u0000 Love\r\nlace\u007F")).toBe("Ada Lovelace");
    expect(invitationName("a".repeat(200))).toHaveLength(80);
  });

  it("builds the title and the description without anything else the visitor wrote", () => {
    expect(bookingInvitation("Intro call", "Ada Lovelace", "ada@example.com")).toEqual({
      title: "Intro call - Ada Lovelace",
      description: "Ada Lovelace <ada@example.com>",
    });
    expect(bookingInvitation("Intro call", "https://evil.example", "ada@example.com")).toEqual({
      title: "Intro call",
      description: "ada@example.com",
    });
  });
});
