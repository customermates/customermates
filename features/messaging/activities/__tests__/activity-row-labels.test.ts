import { describe, expect, it } from "vitest";

import {
  buildCalendarSubtitle,
  buildMessageSubtitle,
  formatFieldList,
  resolveActorName,
  resolveMessagePreview,
  resolveMessageSenderName,
  resolveMessageTitle,
} from "../activity-row-labels";

const baseSubtitle = {
  preview: null,
  isGroup: false,
  senderIsMine: false,
  senderName: "Leon Becker",
  youPrefix: "You:",
  attachmentKindLabel: null,
};

describe("formatFieldList", () => {
  it("joins the fields it shows with a separator", () => {
    expect(formatFieldList(["Name", "Email"])).toBe("Name · Email");
  });

  it("collapses the tail into a count once past the inline limit", () => {
    expect(formatFieldList(["a", "b", "c", "d", "e"])).toBe("a · b · c +2");
  });

  it("shows every field when exactly at the limit", () => {
    expect(formatFieldList(["a", "b", "c"])).toBe("a · b · c");
  });

  it("returns nothing for no fields, so the caller can fall back to the event name", () => {
    expect(formatFieldList([])).toBe("");
  });
});

describe("resolveMessagePreview", () => {
  it("keeps a normal preview", () => {
    expect(resolveMessagePreview("Quarterly review", false)).toBe("Quarterly review");
  });

  it("drops a body the provider could not render", () => {
    expect(resolveMessagePreview("[unsupported]", true)).toBeNull();
  });

  it("treats an absent body as no preview", () => {
    expect(resolveMessagePreview(null, false)).toBeNull();
    expect(resolveMessagePreview("", false)).toBeNull();
  });
});

describe("buildMessageSubtitle", () => {
  it("shows the preview alone in a one-to-one thread", () => {
    expect(buildMessageSubtitle({ ...baseSubtitle, preview: "See attached" })).toEqual({
      kind: "preview",
      preview: "See attached",
    });
  });

  it("names the sender in a group thread so the preview is attributable", () => {
    expect(buildMessageSubtitle({ ...baseSubtitle, preview: "See attached", isGroup: true })).toEqual({
      kind: "prefixedPreview",
      prefix: "Leon Becker:",
      preview: "See attached",
    });
  });

  it("uses the first-person prefix for the viewer's own message in a group thread", () => {
    expect(buildMessageSubtitle({ ...baseSubtitle, preview: "On it", isGroup: true, senderIsMine: true })).toEqual({
      kind: "prefixedPreview",
      prefix: "You:",
      preview: "On it",
    });
  });

  it("falls back to the attachment kind when there is no preview", () => {
    expect(buildMessageSubtitle({ ...baseSubtitle, attachmentKindLabel: "Image" })).toEqual({
      kind: "attachmentKind",
      label: "Image",
    });
  });

  it("falls back to the unsupported state when there is neither preview nor attachment", () => {
    expect(buildMessageSubtitle(baseSubtitle)).toEqual({ kind: "unsupported" });
  });

  it("prefers the preview over the attachment label when both exist", () => {
    expect(buildMessageSubtitle({ ...baseSubtitle, preview: "Hello", attachmentKindLabel: "Image" })).toEqual({
      kind: "preview",
      preview: "Hello",
    });
  });
});

describe("resolveMessageSenderName", () => {
  it("uses the resolved sender label when there is one", () => {
    expect(resolveMessageSenderName("Leon Becker", false, "You", "Unknown sender")).toBe("Leon Becker");
  });

  it("names the viewer when their own message has no label", () => {
    expect(resolveMessageSenderName(null, true, "You", "Unknown sender")).toBe("You");
  });

  it("falls back to the unknown-sender label otherwise", () => {
    expect(resolveMessageSenderName("", false, "You", "Unknown sender")).toBe("Unknown sender");
  });
});

describe("resolveMessageTitle", () => {
  it("titles a group thread by its label", () => {
    expect(resolveMessageTitle(true, "Migration crew", "Leon Becker")).toBe("Migration crew");
  });

  it("falls back to the sender when a group thread has no usable label", () => {
    expect(resolveMessageTitle(true, "   ", "Leon Becker")).toBe("Leon Becker");
    expect(resolveMessageTitle(true, null, "Leon Becker")).toBe("Leon Becker");
  });

  it("titles a one-to-one thread by the sender even when a label exists", () => {
    expect(resolveMessageTitle(false, "Migration crew", "Leon Becker")).toBe("Leon Becker");
  });
});

describe("resolveActorName", () => {
  it("uses the full name when present", () => {
    expect(resolveActorName("Max", "Bergmann", "max@example.com")).toBe("Max Bergmann");
  });

  it("tolerates a missing half of the name", () => {
    expect(resolveActorName("Max", null, "max@example.com")).toBe("Max");
    expect(resolveActorName(null, "Bergmann", "max@example.com")).toBe("Bergmann");
  });

  it("falls back to the email rather than rendering blank", () => {
    expect(resolveActorName(null, null, "max@example.com")).toBe("max@example.com");
    expect(resolveActorName("  ", "  ", "max@example.com")).toBe("max@example.com");
  });
});

describe("buildCalendarSubtitle", () => {
  it("joins the parts that are present", () => {
    expect(buildCalendarSubtitle(["09:00 – 10:00", "Berlin", "Cancelled"])).toBe("09:00 – 10:00 · Berlin · Cancelled");
  });

  it("skips absent parts rather than leaving empty separators", () => {
    expect(buildCalendarSubtitle(["09:00 – 10:00", null, undefined, "Cancelled"])).toBe("09:00 – 10:00 · Cancelled");
    expect(buildCalendarSubtitle(["09:00 – 10:00", ""])).toBe("09:00 – 10:00");
  });
});
