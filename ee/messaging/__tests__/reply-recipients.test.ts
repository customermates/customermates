import type { MessagingAttendee } from "../messaging.schema";

import { describe, expect, it } from "vitest";

import { deriveReplyRecipients } from "../reply-recipients";

function attendee(identifier: string, isSelf = false): MessagingAttendee {
  return {
    attendeeId: identifier,
    displayName: null,
    identifier,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    isSelf,
  };
}

function message(over: {
  direction: "inbound" | "outbound";
  sender: MessagingAttendee;
  to?: MessagingAttendee[];
  cc?: MessagingAttendee[];
  isDraft?: boolean;
}) {
  return {
    direction: over.direction,
    isDraft: over.isDraft ?? false,
    sender: over.sender,
    recipients: { to: over.to ?? [], cc: over.cc ?? [], bcc: [] },
  };
}

describe("deriveReplyRecipients", () => {
  it("replies all to the last inbound, keeping Cc and excluding own addresses", () => {
    const result = deriveReplyRecipients(
      [attendee("ben@gmx.de"), attendee("mail@customermates.com")],
      [
        message({
          direction: "outbound",
          sender: attendee("me@outlook.de", true),
          to: [attendee("ben@gmx.de"), attendee("me@outlook.de", true)],
        }),
        message({
          direction: "inbound",
          sender: attendee("ben@gmx.de"),
          to: [attendee("me@outlook.de", true)],
          cc: [attendee("mail@customermates.com")],
        }),
      ],
    );

    expect(result.to).toEqual(["ben@gmx.de"]);
    expect(result.cc).toEqual(["mail@customermates.com"]);
  });

  it("falls back to the non-self participants when no inbound message exists", () => {
    const result = deriveReplyRecipients(
      [attendee("ben@gmx.de"), attendee("mail@customermates.com")],
      [
        message({
          direction: "outbound",
          sender: attendee("me@outlook.de", true),
          to: [attendee("ben@gmx.de")],
        }),
      ],
    );

    expect(result.to).toEqual(["ben@gmx.de", "mail@customermates.com"]);
    expect(result.cc).toEqual([]);
  });

  it("keeps the inbound sender even when it is my own address in a self-thread", () => {
    const result = deriveReplyRecipients(
      [attendee("me@outlook.de", true)],
      [
        message({
          direction: "inbound",
          sender: attendee("me@outlook.de", true),
          to: [attendee("me@outlook.de", true)],
        }),
      ],
    );

    expect(result.to).toEqual(["me@outlook.de"]);
    expect(result.cc).toEqual([]);
  });

  it("skips drafts when picking the last inbound message", () => {
    const result = deriveReplyRecipients(
      [attendee("ben@gmx.de")],
      [
        message({ direction: "inbound", sender: attendee("ben@gmx.de"), to: [attendee("me@outlook.de", true)] }),
        message({ direction: "inbound", sender: attendee("other@x.com"), isDraft: true }),
      ],
    );

    expect(result.to).toEqual(["ben@gmx.de"]);
  });
});
