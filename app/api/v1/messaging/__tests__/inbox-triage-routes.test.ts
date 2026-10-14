import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { ForbiddenError } from "@/core/errors/app-errors";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const interactors = vi.hoisted(() => ({
  updateThreadState: vi.fn(),
  moveEmailThread: vi.fn(),
  createAuthLink: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getUpdateThreadStateInteractor: () => ({ invoke: interactors.updateThreadState }),
  getMoveEmailThreadInteractor: () => ({ invoke: interactors.moveEmailThread }),
  getCreateAuthLinkInteractor: () => ({ invoke: interactors.createAuthLink }),
}));

import { POST as setState } from "../threads/[id]/state/route";
import { POST as moveThread } from "../threads/[id]/move/route";
import { POST as createConnectLink } from "../connected-accounts/connect-link/route";

const THREAD_ID = "00000000-0000-4000-8000-000000000001";
const OTHER_ID = "00000000-0000-4000-8000-000000000002";
const MESSAGE_ID = "00000000-0000-4000-8000-000000000003";

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost:4105/api/v1/messaging/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "test-transport-only" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const params = { params: Promise.resolve({ id: THREAD_ID }) };

async function failureOf(response: Response) {
  return StructuredErrorResponseSchema.parse(await response.json()).error;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /v1/messaging/threads/{id}/state", () => {
  it("sets the state through the state interactor with the path id winning over the body", async () => {
    interactors.updateThreadState.mockResolvedValue({ ok: true, data: { threadId: THREAD_ID, state: "closed" } });

    const response = await setState(
      request(`threads/${THREAD_ID}/state`, { state: "closed", threadId: OTHER_ID }),
      params,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ threadId: THREAD_ID, state: "closed" });
    expect(interactors.updateThreadState).toHaveBeenCalledExactlyOnceWith({ threadId: THREAD_ID, state: "closed" });
  });

  it("hands sharing to the state interactor, which refuses it as a validation failure", async () => {
    interactors.updateThreadState.mockResolvedValue({
      ok: false,
      error: createZodError("Unrecognized key: sharedToCrm", []),
    });

    const response = await setState(
      request(`threads/${THREAD_ID}/state`, { state: "open", sharedToCrm: true }),
      params,
    );

    expect(response.status).toBe(400);
    expect((await failureOf(response)).kind).toBe("validation");
    expect(interactors.updateThreadState).toHaveBeenCalledExactlyOnceWith({
      threadId: THREAD_ID,
      state: "open",
      sharedToCrm: true,
    });
  });

  it("rejects a malformed body before the interactor runs", async () => {
    const response = await setState(request(`threads/${THREAD_ID}/state`, "{"), params);

    expect(response.status).toBe(400);
    expect(interactors.updateThreadState).not.toHaveBeenCalled();
  });

  it("answers 403 when the caller may not edit inbox messages", async () => {
    interactors.updateThreadState.mockRejectedValue(new ForbiddenError());

    const response = await setState(request(`threads/${THREAD_ID}/state`, { state: "spam" }), params);

    expect(response.status).toBe(403);
    expect(await failureOf(response)).toMatchObject({
      kind: "authorization",
      issues: [expect.objectContaining({ customCode: CustomErrorCode.permissionDenied })],
    });
  });

  it("answers 404 for a conversation the caller cannot see, such as another workspace's", async () => {
    interactors.updateThreadState.mockResolvedValue({
      ok: false,
      error: createZodError("Thread not found", ["threadId"], { error: CustomErrorCode.threadNotFound }),
    });

    const response = await setState(request(`threads/${THREAD_ID}/state`, { state: "unread" }), params);

    expect(response.status).toBe(404);
    expect((await failureOf(response)).kind).toBe("not_found");
  });
});

describe("POST /v1/messaging/threads/{id}/move", () => {
  const moved = {
    threadId: THREAD_ID,
    folderId: "archive",
    folderName: "Archive",
    movedCount: 1,
    skippedCount: 0,
    failedCount: 0,
    hiddenFromInbox: true,
    rateLimited: false,
  };

  it("moves through the move-email-thread interactor with the path id winning over the body", async () => {
    interactors.moveEmailThread.mockResolvedValue({ ok: true, data: moved });

    const response = await moveThread(
      request(`threads/${THREAD_ID}/move`, { threadId: OTHER_ID, folderId: "archive", messageId: MESSAGE_ID }),
      params,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(moved);
    expect(interactors.moveEmailThread).toHaveBeenCalledExactlyOnceWith({
      threadId: THREAD_ID,
      folderId: "archive",
      messageId: MESSAGE_ID,
    });
  });

  it("answers 403 when the caller may not edit inbox messages", async () => {
    interactors.moveEmailThread.mockRejectedValue(new ForbiddenError());

    const response = await moveThread(request(`threads/${THREAD_ID}/move`, { folderId: "archive" }), params);

    expect(response.status).toBe(403);
    expect((await failureOf(response)).kind).toBe("authorization");
  });

  it("answers 404 for an unknown folder", async () => {
    interactors.moveEmailThread.mockResolvedValue({
      ok: false,
      error: createZodError("Folder not found", ["folderId"], {
        error: CustomErrorCode.emailFolderNotFound,
        kind: "not_found",
      }),
    });

    const response = await moveThread(request(`threads/${THREAD_ID}/move`, { folderId: "gone" }), params);

    expect(response.status).toBe(404);
    expect(await failureOf(response)).toMatchObject({
      kind: "not_found",
      issues: [expect.objectContaining({ path: ["folderId"], customCode: CustomErrorCode.emailFolderNotFound })],
    });
  });
});

describe("POST /v1/messaging/connected-accounts/connect-link", () => {
  it("returns the hosted link the create-auth-link interactor redirects to", async () => {
    interactors.createAuthLink.mockResolvedValue({ redirect: "https://account.example.com/connect/abc" });

    const response = await createConnectLink(request("connected-accounts/connect-link", { channel: "whatsapp" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: "https://account.example.com/connect/abc" });
    expect(interactors.createAuthLink).toHaveBeenCalledExactlyOnceWith({ channel: "whatsapp" });
  });

  it("returns a missing messaging plan as a structured failure that names the entitlement", async () => {
    interactors.createAuthLink.mockResolvedValue({
      ok: false,
      error: createZodError("Upgrade to connect a channel", [], { entitlement: "messagingRequiresPro" }),
      code: "messagingRequiresPro",
    });

    const response = await createConnectLink(request("connected-accounts/connect-link", { channel: "google" }));

    expect(response.status).toBe(400);
    expect(await failureOf(response)).toMatchObject({
      kind: "validation",
      issues: [expect.objectContaining({ entitlement: "messagingRequiresPro" })],
    });
  });

  it("answers 403 when the caller may not create inbox messages", async () => {
    interactors.createAuthLink.mockRejectedValue(new ForbiddenError());

    const response = await createConnectLink(request("connected-accounts/connect-link", { channel: "google" }));

    expect(response.status).toBe(403);
    expect((await failureOf(response)).kind).toBe("authorization");
  });

  it("rejects a malformed body before the interactor runs", async () => {
    const response = await createConnectLink(request("connected-accounts/connect-link", "{"));

    expect(response.status).toBe(400);
    expect(interactors.createAuthLink).not.toHaveBeenCalled();
  });
});
