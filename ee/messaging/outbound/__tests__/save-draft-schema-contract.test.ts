import { describe, expect, it } from "vitest";

import { SaveNewThreadDraftSchema, SaveReplyDraftBodySchema } from "../save-draft.interactor";
import { SendEmailSchema } from "../send-email.interactor";
import { SendChatMessageSchema } from "../send-chat-message.interactor";
import { StartChatInputSchema } from "../start-chat.interactor";
import { DiscardDraftSchema } from "../discard-draft.interactor";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const THREAD_ID = "00000000-0000-4000-8000-000000000002";

const DRAFT_ID = "00000000-0000-4000-8000-000000000003";
const DRAFT_REVISION = "2026-09-04T10:00:00.000Z";

const newThreadDraft = {
  connectedAccountId: ACCOUNT_ID,
  recipients: ["recipient@example.com"],
  body: "Draft body",
};

describe("SaveNewThreadDraftSchema", () => {
  it("accepts the explicit account and nonempty recipients contract", () => {
    expect(SaveNewThreadDraftSchema.safeParse(newThreadDraft).success).toBe(true);
  });

  it.each([
    ["connectedAccountId", { recipients: ["recipient@example.com"], body: "Draft body" }],
    ["recipients", { connectedAccountId: ACCOUNT_ID, body: "Draft body" }],
    ["nonempty recipients", { ...newThreadDraft, recipients: [] }],
  ])("requires %s", (_label, value) => {
    expect(SaveNewThreadDraftSchema.safeParse(value).success).toBe(false);
  });

  it.each([
    ["threadId", { ...newThreadDraft, threadId: THREAD_ID }],
    ["unknown fields", { ...newThreadDraft, unexpected: true }],
  ])("rejects %s", (_label, value) => {
    expect(SaveNewThreadDraftSchema.safeParse(value).success).toBe(false);
  });
});

describe("SaveReplyDraftBodySchema", () => {
  it("accepts reply content without route-owned target fields", () => {
    expect(SaveReplyDraftBodySchema.safeParse({ body: "Reply draft" }).success).toBe(true);
  });

  it.each([
    ["threadId", { body: "Reply draft", threadId: THREAD_ID }],
    ["connectedAccountId", { body: "Reply draft", connectedAccountId: ACCOUNT_ID }],
    ["recipients", { body: "Reply draft", recipients: ["recipient@example.com"] }],
  ])("rejects the %s target field", (_label, value) => {
    expect(SaveReplyDraftBodySchema.safeParse(value).success).toBe(false);
  });
});

describe("SendEmailSchema OpenAPI metadata", () => {
  it("describes body format and draft reconciliation for generated API clients", () => {
    expect(SendEmailSchema.shape.bodyFormat.description).toMatch(/interpret body/i);
    expect(SendEmailSchema.shape.draftMessageId.description).toMatch(/draft.+delivery succeeds/i);
    expect(SendEmailSchema.shape.draftRevision.description).toMatch(/opaque revision/i);
  });
});

describe("outbound draft revision contracts", () => {
  const email = {
    connectedAccountId: ACCOUNT_ID,
    to: [{ identifier: "recipient@example.com" }],
    subject: "Subject",
    body: "Body",
  };
  const chat = { threadId: THREAD_ID, text: "Body" };
  const startChat = {
    connectedAccountId: ACCOUNT_ID,
    attendeeIdentifiers: ["recipient-handle"],
    text: "Body",
  };

  it.each([
    [SendEmailSchema, email],
    [SendChatMessageSchema, chat],
    [StartChatInputSchema, startChat],
  ])("requires draftMessageId and draftRevision as a pair", (schema, input) => {
    expect(schema.safeParse({ ...input, draftMessageId: DRAFT_ID }).success).toBe(false);
    expect(schema.safeParse({ ...input, draftRevision: DRAFT_REVISION }).success).toBe(false);
    expect(
      schema.safeParse({
        ...input,
        draftMessageId: DRAFT_ID,
        draftRevision: DRAFT_REVISION,
      }).success,
    ).toBe(true);
  });

  it("requires an opaque revision for explicit discard", () => {
    expect(DiscardDraftSchema.safeParse({ messageId: DRAFT_ID }).success).toBe(false);
    expect(
      DiscardDraftSchema.safeParse({
        messageId: DRAFT_ID,
        draftRevision: DRAFT_REVISION,
      }).success,
    ).toBe(true);
  });
});
