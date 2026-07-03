import type { MessagingAttendee } from "../messaging.schema";
import type { MessagingProvider, MessagingThreadType } from "@/generated/prisma";

import { describe, expect, it } from "vitest";

import { deriveThreadDisplay } from "../thread-display";

const t = (key: string) => key;

function attendee(displayName: string): MessagingAttendee {
  return {
    attendeeId: displayName,
    displayName,
    identifier: `${displayName}@id`,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    isSelf: false,
  };
}

function thread(over: {
  type: MessagingThreadType;
  subject: string | null;
  name: string | null;
  provider: MessagingProvider;
  participants: MessagingAttendee[];
}) {
  return deriveThreadDisplay(over, t);
}

describe("deriveThreadDisplay title precedence", () => {
  it("leads a one-on-one email with its subject and keeps the sender as the secondary line", () => {
    const view = thread({
      type: "single",
      subject: "Re: Q4 numbers",
      name: null,
      provider: "google",
      participants: [attendee("Dirk Kreuter")],
    });

    expect(view.displayName).toBe("Re: Q4 numbers");
    expect(view.displayNameSecondary).toBe("Dirk Kreuter");
  });

  it("shows the person — not the InMail subject — for a one-on-one LinkedIn thread", () => {
    const view = thread({
      type: "single",
      subject: "Gratis Whitepaper",
      name: "Gratis Whitepaper",
      provider: "linkedin",
      participants: [attendee("Dirk Kreuter")],
    });

    expect(view.displayName).toBe("Dirk Kreuter");
  });

  it("shows the group name for a group thread", () => {
    const view = thread({
      type: "group",
      subject: null,
      name: "Europapark",
      provider: "whatsapp",
      participants: [attendee("Member One")],
    });

    expect(view.displayName).toBe("Europapark");
  });

  it("falls back to the counterpart for an email with no subject", () => {
    const view = thread({
      type: "single",
      subject: null,
      name: null,
      provider: "google",
      participants: [attendee("Jane Doe")],
    });

    expect(view.displayName).toBe("Jane Doe");
  });
});

describe("deriveThreadDisplay secondary line", () => {
  function whatsappAttendee(displayName: string, identifier: string): MessagingAttendee {
    return {
      attendeeId: identifier,
      displayName,
      identifier,
      pictureUrl: null,
      profileUrl: null,
      headline: null,
      occupation: null,
      isSelf: false,
    };
  }

  it("keeps the phone as the secondary line when the counterpart has a real name", () => {
    const view = thread({
      type: "single",
      subject: null,
      name: null,
      provider: "whatsapp",
      participants: [whatsappAttendee("Finn", "491715308840")],
    });

    expect(view.displayName).toBe("Finn");
    expect(view.displayNameSecondary).toBe("+491715308840");
  });

  it("suppresses the secondary line when the only name is the phone number itself", () => {
    const view = thread({
      type: "single",
      subject: null,
      name: null,
      provider: "whatsapp",
      participants: [whatsappAttendee("+49 151 23456789", "4915123456789")],
    });

    expect(view.displayName).toBe("+4915123456789");
    expect(view.displayNameSecondary).toBeNull();
  });
});
