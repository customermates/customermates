import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { AuthError, ForbiddenError } from "@/core/errors/app-errors";

const interactors = vi.hoisted(() => ({ send: vi.fn(), save: vi.fn(), reply: vi.fn(), discard: vi.fn() }));

vi.mock("@/core/di", () => ({
  getSendEmailInteractor: () => ({ invoke: interactors.send }),
  getSaveNewThreadDraftInteractor: () => ({ invoke: interactors.save }),
  getSaveReplyDraftInteractor: () => ({ invoke: interactors.reply }),
  getDiscardDraftInteractor: () => ({ invoke: interactors.discard }),
}));

import { POST as sendEmail } from "../send-email/route";
import { POST as saveNewDraft } from "../drafts/route";
import { POST as saveReplyDraft } from "../threads/[id]/drafts/route";
import { DELETE as discardDraft } from "../drafts/[id]/route";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000001";
const THREAD_ID = "00000000-0000-4000-8000-000000000002";
const DRAFT_ID = "00000000-0000-4000-8000-000000000003";
const REVISION = "2026-09-04T10:00:00.001Z";
const BODY = "**Draft body** with [a link](https://example.com)";
const email = {
  connectedAccountId: ACCOUNT_ID,
  to: [{ identifier: "recipient@example.com" }],
  subject: "Transport test",
  body: BODY,
  bodyFormat: "markdown",
  draftMessageId: DRAFT_ID,
  draftRevision: REVISION,
};
const newDraft = {
  connectedAccountId: ACCOUNT_ID,
  recipients: ["recipient@example.com"],
  subject: "Draft subject",
  body: BODY,
};
const replyDraft = { subject: "Reply subject", body: BODY, cc: ["copy@example.com"], bcc: ["blind@example.com"] };
const draftDto = { id: DRAFT_ID, draftRevision: REVISION, messagingThreadId: THREAD_ID, isDraft: true };

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:4105/api/v1/messaging/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "test-transport-only" },
    body: JSON.stringify(body),
  });
}

function discardRequest(revision?: string) {
  const url = new URL(`http://localhost:4105/api/v1/messaging/drafts/${DRAFT_ID}`);
  if (revision !== undefined) url.searchParams.set("draftRevision", revision);
  return new NextRequest(url, { method: "DELETE" });
}

beforeEach(() => {
  vi.resetAllMocks();
  interactors.send.mockResolvedValue({ ok: true, data: { id: "sent-message", messagingThreadId: THREAD_ID } });
  interactors.save.mockResolvedValue({ ok: true, data: draftDto });
  interactors.reply.mockResolvedValue({ ok: true, data: draftDto });
  interactors.discard.mockResolvedValue({ ok: true, data: { threadId: THREAD_ID } });
});

describe("messaging REST draft/send adapters", () => {
  it.each([{}, { threadId: THREAD_ID }])("forwards Markdown and exact revision for email target %j", async (target) => {
    const body = { ...email, ...target, cc: ["copy@example.com"], bcc: ["blind@example.com"] };
    const response = await sendEmail(request("send-email", body));

    expect(interactors.send).toHaveBeenCalledExactlyOnceWith(body);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ id: "sent-message", messagingThreadId: THREAD_ID });
  });

  it("returns a successful unresolved sent copy as null without a resend", async () => {
    interactors.send.mockResolvedValue({ ok: true, data: null });
    const response = await sendEmail(request("send-email", email));

    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
    expect(interactors.send).toHaveBeenCalledOnce();
  });

  it("maps repeated new-draft saves to the same contract and returns each current revision", async () => {
    const first = await saveNewDraft(request("drafts", newDraft));
    const nextRevision = "2026-09-04T10:00:01.001Z";
    interactors.save.mockResolvedValue({ ok: true, data: { ...draftDto, draftRevision: nextRevision } });
    const edited = { ...newDraft, body: "Edited Markdown **body**" };
    const second = await saveNewDraft(request("drafts", edited));

    expect(interactors.save).toHaveBeenNthCalledWith(1, newDraft);
    expect(interactors.save).toHaveBeenNthCalledWith(2, edited);
    expect(await first.json()).toEqual(draftDto);
    expect(await second.json()).toEqual({ ...draftDto, draftRevision: nextRevision });
    expect(interactors.send).not.toHaveBeenCalled();
  });

  it("binds reply-draft content to the path-owned thread id", async () => {
    const response = await saveReplyDraft(request(`threads/${THREAD_ID}/drafts`, replyDraft), {
      params: Promise.resolve({ id: THREAD_ID }),
    });

    expect(interactors.reply).toHaveBeenCalledExactlyOnceWith({ threadId: THREAD_ID, draft: replyDraft });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(draftDto);
    expect(interactors.send).not.toHaveBeenCalled();
  });

  it.each([{ threadId: THREAD_ID }, { connectedAccountId: ACCOUNT_ID }, { recipients: ["other@example.com"] }])(
    "leaves reply target-override validation to the interactor: %j",
    async (override) => {
      interactors.reply.mockResolvedValue({
        ok: false,
        error: new z.ZodError([{ code: "custom", path: ["draft"], message: "Invalid reply target" }]),
      });
      const response = await saveReplyDraft(request(`threads/${THREAD_ID}/drafts`, { ...replyDraft, ...override }), {
        params: Promise.resolve({ id: THREAD_ID }),
      });

      expect(response.status).toBe(400);
      expect(interactors.reply).toHaveBeenCalledExactlyOnceWith({
        threadId: THREAD_ID,
        draft: { ...replyDraft, ...override },
      });
      expect(interactors.save).not.toHaveBeenCalled();
    },
  );

  it.each([{ ...newDraft, recipients: [] }, { ...newDraft, threadId: THREAD_ID }, { body: BODY }])(
    "forwards malformed cold-draft targets to the interactor for validation: %j",
    async (body) => {
      interactors.save.mockResolvedValue({
        ok: false,
        error: new z.ZodError([{ code: "custom", path: [], message: "Invalid new-draft target" }]),
      });
      const response = await saveNewDraft(request("drafts", body));
      expect(response.status).toBe(400);
      expect(interactors.save).toHaveBeenCalledExactlyOnceWith(body);
    },
  );

  it("forwards the exact discard revision from the URL", async () => {
    const response = await discardDraft(discardRequest(REVISION), { params: Promise.resolve({ id: DRAFT_ID }) });

    expect(interactors.discard).toHaveBeenCalledExactlyOnceWith({ messageId: DRAFT_ID, draftRevision: REVISION });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ threadId: THREAD_ID });
  });

  it("passes a missing revision to validation instead of inventing a revision for the caller", async () => {
    interactors.discard.mockResolvedValue({
      ok: false,
      error: new z.ZodError([{ code: "custom", path: ["draftRevision"], message: "Draft revision is required" }]),
    });
    const response = await discardDraft(discardRequest(), { params: Promise.resolve({ id: DRAFT_ID }) });

    expect(interactors.discard).toHaveBeenCalledExactlyOnceWith({ messageId: DRAFT_ID, draftRevision: "" });
    expect(response.status).toBe(400);
    expect(await response.json()).toContain("Draft revision is required");
  });
});

const routes = [
  {
    name: "send-email",
    invoke: () => sendEmail(request("send-email", email)),
    spy: interactors.send,
  },
  {
    name: "new draft",
    invoke: () => saveNewDraft(request("drafts", newDraft)),
    spy: interactors.save,
  },
  {
    name: "reply draft",
    invoke: () =>
      saveReplyDraft(request(`threads/${THREAD_ID}/drafts`, replyDraft), {
        params: Promise.resolve({ id: THREAD_ID }),
      }),
    spy: interactors.reply,
  },
  {
    name: "discard draft",
    invoke: () => discardDraft(discardRequest(REVISION), { params: Promise.resolve({ id: DRAFT_ID }) }),
    spy: interactors.discard,
  },
];

describe.each(routes)("$name REST failure mapping", ({ invoke, spy }) => {
  it.each([
    [new AuthError(), 401],
    [new ForbiddenError(), 403],
  ])("preserves interactor access failure %s as HTTP %s", async (error, status) => {
    spy.mockRejectedValue(error);
    const response = await invoke();

    expect(response.status).toBe(status);
    expect(await response.json()).toBe((error as Error).message);
    expect(spy).toHaveBeenCalledOnce();
  });

  it("returns the interactor failure without swallowing it or repeating the operation", async () => {
    spy.mockResolvedValue({
      ok: false,
      error: new z.ZodError([{ code: "custom", path: ["draftRevision"], message: "Draft revision no longer exists" }]),
    });
    const response = await invoke();

    expect(response.status).toBe(400);
    expect(await response.json()).toContain("Draft revision no longer exists");
    expect(spy).toHaveBeenCalledOnce();
  });
});
