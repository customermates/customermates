import type { MessagingThread } from "@/ee/messaging/messaging.schema";

import { describe, expect, it } from "vitest";

import { draftThreadTarget } from "../thread-panel";

function coldDraft(provider: string, participants: Array<{ identifier: string; isSelf: boolean }>) {
  return {
    id: "thread-1",
    connectedAccountId: "account-1",
    provider,
    unipileThreadId: "draft_thread-1",
    participants: participants.map((participant) => ({ ...participant, displayName: null })),
  } as unknown as MessagingThread;
}

describe("draftThreadTarget", () => {
  it("keeps a Cc-only or Bcc-only email draft in new-message mode with a fixed empty To", () => {
    expect(draftThreadTarget(coldDraft("mail", [{ identifier: "me@example.test", isSelf: true }]))).toEqual({
      connectedAccountId: "account-1",
      recipients: [],
      draftThreadId: "thread-1",
    });
  });

  it("keeps the saved To recipients of a new email draft", () => {
    expect(
      draftThreadTarget(coldDraft("google", [{ identifier: "to@example.test", isSelf: false }]))?.recipients,
    ).toEqual([{ identifier: "to@example.test", displayName: null }]);
  });

  it("does not treat a chat draft without a counterpart as a new conversation", () => {
    expect(draftThreadTarget(coldDraft("whatsapp", []))).toBeNull();
  });

  it("ignores conversations that already exist at the provider", () => {
    expect(draftThreadTarget({ ...coldDraft("mail", []), unipileThreadId: "provider-thread" })).toBeNull();
  });
});
