import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const harness = vi.hoisted(() => ({
  env: { AGENT_CHAT_DISABLED: false },
  create: vi.fn(),
  complete: vi.fn(),
}));

vi.mock("@/env", () => ({ env: harness.env }));
vi.mock("@/core/di", () => ({
  getCreateAgentChatFileUploadInteractor: () => ({ invoke: harness.create }),
  getCompleteAgentChatFileUploadInteractor: () => ({ invoke: harness.complete }),
}));

import { POST as start } from "../route";
import { maxDuration, POST as complete } from "../[fileId]/complete/route";

const FILE_ID = "64000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ fileId: FILE_ID }) };
const body = { name: "Offer.pdf", size: 2_048, mimeType: "application/pdf" };

function failure(code: CustomErrorCode, kind?: string) {
  return { ok: false, error: createZodError(code, [], { error: code, ...(kind ? { kind } : {}) }) };
}

function request(path: string, payload?: unknown) {
  return new NextRequest(`http://localhost:4105${path}`, {
    method: "POST",
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  harness.env.AGENT_CHAT_DISABLED = false;
});

describe("routes for files given to Mate", () => {
  it("starts an upload with the body and maps a full workspace storage to 409", async () => {
    harness.create.mockResolvedValueOnce({ ok: true, data: { fileId: FILE_ID, upload: { url: "u" } } });
    const started = await start(request("/api/agent/files", body));
    expect(started.status).toBe(200);
    expect(await started.json()).toEqual({ fileId: FILE_ID, upload: { url: "u" } });
    expect(harness.create).toHaveBeenCalledWith(body);

    harness.create.mockResolvedValueOnce(failure(CustomErrorCode.storageQuotaExceeded, "conflict"));
    const full = await start(request("/api/agent/files", body));
    expect(full.status).toBe(409);
    expect((await full.json()).error.issues[0].customCode).toBe("storageQuotaExceeded");
  });

  it("completes the upload of the path, with time to read the file, and refuses missing bytes", async () => {
    expect(maxDuration).toBe(300);
    harness.complete.mockResolvedValueOnce({ ok: true, data: { id: FILE_ID, extractionStatus: "done" } });
    const done = await complete(request(`/api/agent/files/${FILE_ID}/complete`), params);
    expect(done.status).toBe(200);
    expect(await done.json()).toEqual({ id: FILE_ID, extractionStatus: "done" });
    expect(harness.complete).toHaveBeenCalledWith({ fileId: FILE_ID });

    harness.complete.mockResolvedValueOnce(failure(CustomErrorCode.recordFileUploadIncomplete));
    const incomplete = await complete(request(`/api/agent/files/${FILE_ID}/complete`), params);
    expect(incomplete.status).toBe(400);
    expect((await incomplete.json()).error.issues[0].customCode).toBe("recordFileUploadIncomplete");
  });

  it("does not exist while the assistant is switched off", async () => {
    harness.env.AGENT_CHAT_DISABLED = true;
    expect((await start(request("/api/agent/files", body))).status).toBe(404);
    expect((await complete(request(`/api/agent/files/${FILE_ID}/complete`), params)).status).toBe(404);
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.complete).not.toHaveBeenCalled();
  });
});
