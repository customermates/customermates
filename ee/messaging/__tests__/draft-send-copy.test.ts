import { describe, expect, it } from "vitest";

import { MessagingProvider } from "@/generated/prisma";

import { emailSendCopyHashes, syncedEmailCopyHash } from "../draft-send-copy";
import { buildEmailMessage } from "../unipile.mappers";
import { UnipileEmailSchema } from "../unipile.schema";

const SENDER = "owner@example.test";
const RECIPIENT = "contact@example.test";

const sent = {
  to: [RECIPIENT],
  cc: ["copy@example.test"],
  subject: "Proposal for next week",
  html: "<p>Hello Dana,</p><p>Here is the <strong>proposal</strong> we discussed.</p><p>Best<br>Owner</p>",
  plainText: "Hello Dana,\n\nHere is the **proposal** we discussed.\n\nBest\nOwner",
  attachments: [{ filename: "proposal.pdf" }],
};

function syncedCopy(over: Record<string, unknown> = {}) {
  const email = UnipileEmailSchema.parse({
    id: "email-1",
    thread_id: "thread-1",
    subject: sent.subject,
    body: `<html><head></head><body><div dir="ltr">\n  <p>Hello Dana,</p>\n  <p>Here is the <b>proposal</b>\n  we discussed.</p>\n  <p>Best<br/>\n  Owner</p>\n</div></body></html>`,
    date: "2026-10-16T10:00:05Z",
    folders: ["sent"],
    from: [{ email: SENDER, display_name: "Owner" }],
    to: [{ email: "Contact@Example.test", display_name: "Dana" }],
    cc: [{ email: "copy@example.test" }],
    bcc: [],
    attachments: [{ id: "att-1", filename: "proposal.pdf", mimetype: "application/pdf", file_size: 1200 }],
    ...over,
  });
  const message = buildEmailMessage(email, {
    provider: MessagingProvider.google,
    emailAddress: SENDER,
    sentFolderIds: ["sent"],
  });
  if (!message) throw new Error("synced copy did not map");
  return syncedEmailCopyHash(message);
}

describe("draft send copy matching", () => {
  it("recognises the synced sent copy of an email despite markup, case and line breaks", () => {
    expect(emailSendCopyHashes(sent)).toContain(syncedCopy());
  });

  it("recognises a synced copy that only carries the plain text body", () => {
    const plain = "Hello Dana,\n\nHere is the **proposal** we discussed.\n\nBest\nOwner";

    expect(emailSendCopyHashes(sent)).toContain(syncedCopy({ body: plain }));
  });

  it("ignores Bcc, which the sent copy may not list", () => {
    expect(emailSendCopyHashes(sent)).toContain(
      syncedCopy({ bcc: [{ email: "hidden@example.test" }, { email: "other-hidden@example.test" }] }),
    );
  });

  it.each([
    ["another body", { body: "<p>Hello Dana,</p><p>Here is the revised proposal.</p>" }],
    ["another subject", { subject: "Proposal for next month" }],
    ["another recipient", { to: [{ email: "someone-else@example.test" }] }],
    ["a missing Cc", { cc: [] }],
    ["another attachment", { attachments: [{ id: "att-2", filename: "invoice.pdf" }] }],
    ["no attachment", { attachments: [] }],
  ])("does not match a copy with %s", (_label, over) => {
    expect(emailSendCopyHashes(sent)).not.toContain(syncedCopy(over));
  });
});
