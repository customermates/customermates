import { describe, expect, it } from "vitest";

import { MessagingMessageDirection } from "@/generated/prisma";

import { buildEmailMessage } from "../unipile.mappers";
import { UnipileEmailSchema } from "../unipile.schema";

function email(over: Record<string, unknown> = {}) {
  return UnipileEmailSchema.parse({
    id: "e1",
    email_id: "e1",
    type: "GMAIL",
    thread_id: "t1",
    from_attendee: { identifier: "owner@example.com", display_name: "Owner" },
    to_attendees: [{ identifier: "other@example.com", display_name: "Other" }],
    date: "2026-06-01T00:00:00Z",
    ...over,
  });
}

describe("buildEmailMessage direction + self detection", () => {
  it("marks a sent-role email outbound", () => {
    const msg = buildEmailMessage(email(), true, "owner@example.com");

    expect(msg?.direction).toBe(MessagingMessageDirection.outbound);
    expect(msg?.sender.isSelf).toBe(true);
  });

  it("treats a non-sent email from the account address as outbound", () => {
    const msg = buildEmailMessage(email({ role: "inbox" }), false, "owner@example.com");

    expect(msg?.direction).toBe(MessagingMessageDirection.outbound);
    expect(msg?.sender.isSelf).toBe(true);
  });

  it("matches the account address case-insensitively", () => {
    const msg = buildEmailMessage(email(), false, "Owner@Example.com");

    expect(msg?.direction).toBe(MessagingMessageDirection.outbound);
  });

  it("keeps a genuinely inbound email inbound and flags the account owner recipient as self", () => {
    const msg = buildEmailMessage(
      email({
        from_attendee: { identifier: "other@example.com", display_name: "Other" },
        to_attendees: [
          { identifier: "owner@example.com", display_name: "Owner" },
          { identifier: "third@example.com", display_name: "Third" },
        ],
      }),
      false,
      "owner@example.com",
    );

    expect(msg?.direction).toBe(MessagingMessageDirection.inbound);
    expect(msg?.sender.isSelf).toBe(false);
    expect(msg?.recipients.to.find((r) => r.identifier === "owner@example.com")?.isSelf).toBe(true);
    expect(msg?.recipients.to.find((r) => r.identifier === "third@example.com")?.isSelf).toBeUndefined();
  });

  it("falls back to the isOutbound flag when no account email is given", () => {
    const msg = buildEmailMessage(email(), false, null);

    expect(msg?.direction).toBe(MessagingMessageDirection.inbound);
  });

  it("leaves a one-on-one email at the default type rather than forcing group", () => {
    const msg = buildEmailMessage(email(), true, "owner@example.com");

    expect(msg?.threadType).toBeUndefined();
  });

  it("types an email with multiple counterparts as a group", () => {
    const msg = buildEmailMessage(
      email({
        from_attendee: { identifier: "other@example.com", display_name: "Other" },
        to_attendees: [
          { identifier: "owner@example.com", display_name: "Owner" },
          { identifier: "third@example.com", display_name: "Third" },
        ],
      }),
      false,
      "owner@example.com",
    );

    expect(msg?.threadType).toBe("group");
  });
});
