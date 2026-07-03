import { describe, expect, it } from "vitest";

import { MessagingMessageDirection, MessagingProvider } from "@/generated/prisma";

import { buildEmailMessage } from "../unipile.mappers";
import { UnipileEmailSchema } from "../unipile.schema";

function v2Email(over: Record<string, unknown> = {}) {
  return UnipileEmailSchema.parse({
    id: "e1",
    thread_id: "t1",
    subject: "Hello there",
    body: "<p>hi</p>",
    date: "2026-06-01T00:00:00Z",
    from: [{ email: "owner@example.com", display_name: "Owner" }],
    to: [{ email: "other@example.com", display_name: "Other" }],
    ...over,
  });
}

const account = { provider: MessagingProvider.google, emailAddress: "owner@example.com" };

describe("buildEmailMessage", () => {
  it("marks an email from the account address outbound and flags the sender self", () => {
    const msg = buildEmailMessage(v2Email(), account);

    expect(msg?.direction).toBe(MessagingMessageDirection.outbound);
    expect(msg?.sender.isSelf).toBe(true);
  });

  it("matches the account address case-insensitively", () => {
    const msg = buildEmailMessage(v2Email(), {
      provider: MessagingProvider.google,
      emailAddress: "Owner@Example.com",
    });

    expect(msg?.direction).toBe(MessagingMessageDirection.outbound);
  });

  const placeholderEmail = (folders: string[]) =>
    v2Email({
      from: [{ email: "outlook_d57e@outlook.com", display_name: "Customermates CM" }],
      to: [{ email: "external@other.com" }],
      folders,
    });
  const outlookAccount = {
    provider: MessagingProvider.outlook,
    emailAddress: "owner@example.com",
    sentFolderIds: ["sent-folder-id"],
  };

  it("treats a Sent-folder email as outbound and self even when the from address is a provider placeholder", () => {
    const msg = buildEmailMessage(placeholderEmail(["sent-folder-id"]), outlookAccount);

    expect(msg?.direction).toBe(MessagingMessageDirection.outbound);
    expect(msg?.sender.isSelf).toBe(true);
  });

  it("classifies the same placeholder-from email as inbound when it is not in a Sent folder", () => {
    const msg = buildEmailMessage(placeholderEmail(["inbox-folder-id"]), outlookAccount);

    expect(msg?.direction).toBe(MessagingMessageDirection.inbound);
    expect(msg?.sender.isSelf).toBe(false);
  });

  it("ignores the Sent-folder signal when the account has no sentFolderIds", () => {
    const msg = buildEmailMessage(placeholderEmail(["sent-folder-id"]), {
      provider: MessagingProvider.outlook,
      emailAddress: "owner@example.com",
    });

    expect(msg?.direction).toBe(MessagingMessageDirection.inbound);
  });

  it("keeps a genuinely inbound email inbound and flags the account owner recipient as self", () => {
    const msg = buildEmailMessage(
      v2Email({
        from: [{ email: "other@example.com", display_name: "Other" }],
        to: [
          { email: "owner@example.com", display_name: "Owner" },
          { email: "third@example.com", display_name: "Third" },
        ],
      }),
      account,
    );

    expect(msg?.direction).toBe(MessagingMessageDirection.inbound);
    expect(msg?.sender.isSelf).toBe(false);
    expect(msg?.recipients.to.find((r) => r.identifier === "owner@example.com")?.isSelf).toBe(true);
    expect(msg?.recipients.to.find((r) => r.identifier === "third@example.com")?.isSelf).toBeUndefined();
  });

  it("leaves a one-on-one email at the default type rather than forcing group", () => {
    const msg = buildEmailMessage(v2Email(), account);

    expect(msg?.threadType).toBeUndefined();
  });

  it("fans out cc recipients into a group thread", () => {
    const msg = buildEmailMessage(
      v2Email({
        from: [{ email: "other@example.com", display_name: "Other" }],
        to: [{ email: "owner@example.com", display_name: "Owner" }],
        cc: [{ email: "third@example.com", display_name: "Third" }],
      }),
      account,
    );

    expect(msg?.threadType).toBe("group");
  });

  it("carries subject, body and thread id through", () => {
    const msg = buildEmailMessage(v2Email(), account);

    expect(msg?.subject).toBe("Hello there");
    expect(msg?.bodyHtml).toBe("<p>hi</p>");
    expect(msg?.bodyText).toBeNull();
    expect(msg?.unipileThreadId).toBe("t1");
  });

  it("falls back to the email id as the thread id when thread_id is blank", () => {
    const msg = buildEmailMessage(v2Email({ thread_id: "   " }), account);

    expect(msg?.unipileThreadId).toBe("e1");
  });

  it("maps attachments to the attachment meta shape", () => {
    const msg = buildEmailMessage(
      v2Email({
        attachments: [{ id: "att-1", filename: "doc.pdf", mimetype: "application/pdf", file_size: 4096 }],
      }),
      account,
    );

    expect(msg?.attachmentsMeta).toHaveLength(1);
    expect(msg?.attachmentsMeta[0]).toMatchObject({
      id: "att-1",
      name: "doc.pdf",
      fileName: "doc.pdf",
      mime: "application/pdf",
      size: 4096,
    });
  });
});
