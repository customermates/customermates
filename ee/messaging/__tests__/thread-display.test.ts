import type { MessagingAttendee } from "../messaging.schema";
import type { MessagingProvider, MessagingThreadType } from "@/generated/prisma";

import { describe, expect, it } from "vitest";

import { deriveMessageSender, deriveThreadDisplay } from "../thread-display";

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
  isOwner?: boolean;
}) {
  return deriveThreadDisplay({ ...over, isOwner: over.isOwner ?? true }, t);
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

describe("deriveThreadDisplay self-chat ownership", () => {
  function selfAttendee(): MessagingAttendee {
    return {
      attendeeId: "self",
      displayName: null,
      identifier: "",
      pictureUrl: null,
      profileUrl: null,
      headline: null,
      occupation: null,
      isSelf: true,
    };
  }

  it("labels an owned self-chat as You", () => {
    const view = thread({
      type: "single",
      subject: null,
      name: null,
      provider: "whatsapp",
      participants: [selfAttendee()],
      isOwner: true,
    });

    expect(view.displayName).toBe("Inbox.senderYou");
  });

  it("never labels a shared self-chat as You", () => {
    const view = thread({
      type: "single",
      subject: null,
      name: null,
      provider: "whatsapp",
      participants: [selfAttendee()],
      isOwner: false,
    });

    expect(view.displayName).toBe("Inbox.senderUnknown");
  });
});

describe("deriveThreadDisplay CRM linkage", () => {
  const linkedAnna: MessagingAttendee = {
    ...attendee("Anna Müller"),
    contact: {
      avatarUrl: "https://demo.example/demo/avatars/anna-mueller.svg",
      firstName: "Anna",
      id: "contact-anna",
      lastName: "Müller",
    },
  };
  const unlinkedClara = attendee("Clara Neumann");

  it("marks a group as partially unlinked when only one participant lacks a CRM contact", () => {
    const view = thread({
      type: "group",
      subject: "Customer operations roundtable",
      name: "Customer operations working group",
      provider: "google",
      participants: [linkedAnna, unlinkedClara],
    });

    expect(view.isUnlinked).toBe(true);
  });

  it("does not mark a group as unlinked when every counterpart resolves to a CRM contact", () => {
    const view = thread({
      type: "group",
      subject: "Customer operations roundtable",
      name: "Customer operations working group",
      provider: "google",
      participants: [
        linkedAnna,
        {
          ...attendee("Amin Hassan"),
          contact: {
            avatarUrl: "https://demo.example/demo/avatars/amin-hassan.svg",
            firstName: "Amin",
            id: "contact-amin",
            lastName: "Hassan",
          },
        },
      ],
    });

    expect(view.isUnlinked).toBe(false);
  });
});

describe("deriveMessageSender avatar fallbacks", () => {
  const accountOwner = {
    avatarUrl: "https://demo.example/demo/avatars/max-mustermann.svg",
    displayName: "Max Mustermann",
  };

  it("uses the account owner's identity and avatar for an otherwise anonymous outbound message", () => {
    const sender: MessagingAttendee = {
      ...attendee("self"),
      displayName: null,
      identifier: "",
      isSelf: true,
    };

    const view = deriveMessageSender(
      { direction: "outbound", provider: "google", sender },
      accountOwner,
      null,
      true,
      t,
    );

    expect(view).toMatchObject({
      avatarName: "Max Mustermann",
      avatarUrl: accountOwner.avatarUrl,
      isOutbound: true,
      resolvedName: "Inbox.senderYou",
    });
  });

  it("prefers a resolved sender avatar over the payload and account-owner fallbacks", () => {
    const sender: MessagingAttendee = {
      ...attendee("Max Mustermann"),
      isSelf: true,
      pictureUrl: "https://demo.example/demo/avatars/payload-max.svg",
    };

    const view = deriveMessageSender(
      { direction: "outbound", provider: "google", sender },
      accountOwner,
      "https://demo.example/demo/avatars/resolved-max.svg",
      true,
      t,
    );

    expect(view.avatarUrl).toBe("https://demo.example/demo/avatars/resolved-max.svg");
  });

  it("uses an inbound participant's local avatar without falling back to the account owner", () => {
    const sender: MessagingAttendee = {
      ...attendee("Clara Neumann"),
      pictureUrl: "https://demo.example/demo/avatars/clara-neumann.svg",
    };

    const view = deriveMessageSender({ direction: "inbound", provider: "google", sender }, accountOwner, null, true, t);

    expect(view).toMatchObject({
      avatarName: "Clara Neumann",
      avatarUrl: sender.pictureUrl,
      isOutbound: false,
      isUnlinked: true,
      resolvedName: "Clara Neumann",
    });
  });

  it("does not show the account owner's avatar for an inbound sender with no avatar", () => {
    const view = deriveMessageSender(
      {
        direction: "inbound",
        provider: "google",
        sender: attendee("Clara Neumann"),
      },
      accountOwner,
      null,
      true,
      t,
    );

    expect(view.avatarUrl).toBeUndefined();
  });
});
