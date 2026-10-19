import { afterEach, describe, expect, it, vi } from "vitest";

const notice = vi.hoisted(() => ({ notifyWorkspaceChanged: vi.fn() }));
vi.mock("@/core/errors/workspace-changed-notice", () => notice);

import { CustomErrorCode } from "@/core/validation/validation.types";

import { completeChatFileUpload, startChatFileUpload, startRecordFileUpload } from "../record-file-upload";

const FILE_ID = "64000000-0000-4000-8000-000000000002";

function respond(status: number, payload: unknown) {
  const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify(payload), { status })));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function sent(fetchMock: ReturnType<typeof respond>) {
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, method: init.method, body: JSON.parse(String(init.body)) as unknown };
}

afterEach(() => {
  vi.unstubAllGlobals();
  notice.notifyWorkspaceChanged.mockReset();
});

describe("starting and completing file uploads from the browser", () => {
  it("starts a file field upload and a chat upload with the file's name, size and type", async () => {
    const file = new File(["Offer"], "Offer.pdf", { type: "application/pdf" });
    const field = respond(200, { fileId: FILE_ID, upload: { url: "u" } });
    expect(await startRecordFileUpload({ typeId: FILE_ID, fieldId: FILE_ID, file })).toEqual({
      ok: true,
      data: { fileId: FILE_ID, upload: { url: "u" } },
    });
    expect(sent(field)).toEqual({
      url: "/api/v1/files/uploads",
      method: "POST",
      body: { typeId: FILE_ID, fieldId: FILE_ID, name: "Offer.pdf", size: 5, mimeType: "application/pdf" },
    });

    const chat = respond(200, { fileId: FILE_ID, upload: { url: "u" } });
    expect((await startChatFileUpload(file)).ok).toBe(true);
    expect(sent(chat)).toEqual({
      url: "/api/agent/files",
      method: "POST",
      body: { name: "Offer.pdf", size: 5, mimeType: "application/pdf" },
    });
  });

  it("completes a chat upload and passes the server's message of a refusal on", async () => {
    const done = respond(200, { id: FILE_ID, extractionStatus: "done" });
    expect(await completeChatFileUpload(FILE_ID)).toEqual({
      ok: true,
      data: { id: FILE_ID, extractionStatus: "done" },
    });
    expect(sent(done).url).toBe(`/api/agent/files/${FILE_ID}/complete`);

    respond(409, { error: { kind: "conflict", issues: [{ message: "The workspace storage is full." }] } });
    expect(await startChatFileUpload(new File(["x"], "x.txt"))).toEqual({
      ok: false,
      message: "The workspace storage is full.",
    });
    respond(500, "not json");
    expect(await completeChatFileUpload(FILE_ID)).toEqual({ ok: false, message: null });
    expect(notice.notifyWorkspaceChanged).not.toHaveBeenCalled();
  });

  it("reports a switched workspace instead of an upload failure", async () => {
    respond(409, {
      error: { kind: "conflict", issues: [{ customCode: CustomErrorCode.workspaceChanged, message: "x" }] },
    });
    expect(await startChatFileUpload(new File(["x"], "x.txt"))).toEqual({ ok: false, message: null });
    expect(notice.notifyWorkspaceChanged).toHaveBeenCalledTimes(1);
  });
});
