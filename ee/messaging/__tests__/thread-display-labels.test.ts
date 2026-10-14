import type { MessagingAttendee } from "../messaging.schema";

import { describe, expect, it } from "vitest";

import { displayableIdentifier, identifierLabel, participantLabel, participantAvatar } from "../thread-display";

function attendee(overrides: Partial<MessagingAttendee>): MessagingAttendee {
  return {
    records: [],
    attendeeId: "a",
    identifier: "",
    displayName: null,
    pictureUrl: null,
    profileUrl: null,
    headline: null,
    occupation: null,
    ...overrides,
  } as MessagingAttendee;
}

describe("identifierLabel", () => {
  it("names a linkedin participant by handle rather than by profile url", () => {
    expect(identifierLabel("linkedin", "anna-keller-ops")).toBe("anna-keller-ops");
  });

  it("reduces a pasted profile url to its handle", () => {
    expect(identifierLabel("linkedin", "https://www.linkedin.com/in/anna-keller-ops/")).toBe("anna-keller-ops");
  });

  it("does the same for the other handle providers", () => {
    expect(identifierLabel("telegram", "@anna")).toBe("anna");
    expect(identifierLabel("instagram", "https://www.instagram.com/anna/")).toBe("anna");
  });

  it("leaves email and phone as they were", () => {
    expect(identifierLabel("google", "a@b.com")).toBe("a@b.com");
    expect(identifierLabel("whatsapp", "+491700000000")).toBe("+491700000000");
  });
});

describe("displayableIdentifier stays the linkable form", () => {
  it("still returns the profile url, because subtitles and tooltips want it", () => {
    expect(displayableIdentifier("linkedin", "anna-keller-ops")).toBe("https://www.linkedin.com/in/anna-keller-ops");
  });
});

describe("participantLabel", () => {
  it("prefers the crm contact name", () => {
    const p = attendee({
      identifier: "anna-keller-ops",
      records: [
        {
          ref: { typeId: "people", recordId: "c1" },
          typeLabel: "Person",
          typePluralLabel: "People",
          title: "Anna Keller",
          avatarUrl: null,
          canEdit: false,
        },
      ],
    });

    expect(participantLabel(p, "linkedin", "unknown")).toBe("Anna Keller");
  });

  it("falls back to the provider display name", () => {
    const p = attendee({
      identifier: "anna-keller-ops",
      displayName: "Anna Keller",
    });

    expect(participantLabel(p, "linkedin", "unknown")).toBe("Anna Keller");
  });

  it("names an unknown handle by the handle, not by a url", () => {
    const p = attendee({ identifier: "anna-keller-ops" });

    expect(participantLabel(p, "linkedin", "unknown")).toBe("anna-keller-ops");
  });

  it("uses the fallback when there is nothing at all", () => {
    expect(participantLabel(attendee({}), "linkedin", "unknown")).toBe("unknown");
  });
});

describe("ambiguous participant associations", () => {
  it("uses provider identity presentation instead of selecting a linked business record", () => {
    const p = attendee({
      identifier: "alice@example.test",
      displayName: "Provider Alice",
      pictureUrl: "https://example.test/alice.png",
      records: [
        {
          ref: { typeId: "people", recordId: "alice" },
          typeLabel: "Person",
          typePluralLabel: "People",
          title: "Alice",
          avatarUrl: "https://example.test/contact.png",
          canEdit: true,
        },
        {
          ref: { typeId: "organizations", recordId: "acme" },
          typeLabel: "Organization",
          typePluralLabel: "Organizations",
          title: "Acme",
          avatarUrl: "https://example.test/logo.png",
          canEdit: true,
        },
      ],
    });
    expect(participantLabel(p, "mail", "unknown")).toBe("Provider Alice");
    expect(participantAvatar(p)).toBe("https://example.test/alice.png");
    expect(participantAvatar({ ...p, pictureUrl: null })).toBeNull();
    expect(participantLabel({ ...p, displayName: null }, "mail", "unknown")).toBe("alice@example.test");
  });
});
