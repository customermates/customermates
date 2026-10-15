import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { createZodError } from "@/core/validation/validation.utils";

const interactors = vi.hoisted(() => ({
  createUpload: vi.fn(),
  getFile: vi.fn(),
  readContent: vi.fn(),
  readByGrant: vi.fn(),
  uploadContent: vi.fn(),
  uploadByGrant: vi.fn(),
}));

vi.mock("@/core/di", () => ({
  getCreateRecordFileUploadInteractor: () => ({ invoke: interactors.createUpload }),
  getGetRecordFileInteractor: () => ({ invoke: interactors.getFile }),
  getDownloadRecordFileInteractor: () => ({ invoke: interactors.readContent }),
  getDownloadRecordFileByGrantInteractor: () => ({ invoke: interactors.readByGrant }),
  getUploadRecordFileContentInteractor: () => ({ invoke: interactors.uploadContent }),
  getUploadRecordFileContentByGrantInteractor: () => ({ invoke: interactors.uploadByGrant }),
}));

import { POST as createUpload } from "../uploads/route";
import { GET as getFile } from "../[fileId]/route";
import { GET as download, PUT as upload } from "../[fileId]/content/route";

const FILE_ID = "40000000-0000-4000-8000-000000000001";
const params = { params: Promise.resolve({ fileId: FILE_ID }) };

function failure(code: CustomErrorCode, kind?: string) {
  return { ok: false, error: createZodError(code, [], { error: code, ...(kind ? { kind } : {}) }) };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("file routes", () => {
  it("starts an upload and maps a full workspace storage to 409", async () => {
    interactors.createUpload.mockResolvedValueOnce({ ok: true, data: { fileId: FILE_ID, upload: { url: "u" } } });
    const body = { typeId: FILE_ID, fieldId: FILE_ID, name: "a.pdf", size: 1, mimeType: "application/pdf" };
    const request = () =>
      new NextRequest("http://localhost:4105/api/v1/files/uploads", { method: "POST", body: JSON.stringify(body) });
    const started = await createUpload(request());
    expect(started.status).toBe(200);
    expect(await started.json()).toEqual({ fileId: FILE_ID, upload: { url: "u" } });
    expect(interactors.createUpload).toHaveBeenCalledWith(body);

    interactors.createUpload.mockResolvedValueOnce(failure(CustomErrorCode.storageQuotaExceeded, "conflict"));
    const full = await createUpload(request());
    expect(full.status).toBe(409);
    expect((await full.json()).error.issues[0].customCode).toBe("storageQuotaExceeded");
  });

  it("returns file details and 404 for unknown files", async () => {
    interactors.getFile.mockResolvedValueOnce({ ok: true, data: { id: FILE_ID } });
    expect(
      await (await getFile(new NextRequest(`http://localhost:4105/api/v1/files/${FILE_ID}`), params)).json(),
    ).toEqual({
      id: FILE_ID,
    });
    expect(interactors.getFile).toHaveBeenCalledWith({ fileId: FILE_ID });
    interactors.getFile.mockResolvedValueOnce(failure(CustomErrorCode.recordFileNotFound));
    expect((await getFile(new NextRequest(`http://localhost:4105/api/v1/files/${FILE_ID}`), params)).status).toBe(404);
  });

  it("streams the content with the interactor's status and headers and forwards range and download", async () => {
    interactors.readContent.mockResolvedValueOnce({
      ok: true,
      data: {
        status: 206,
        headers: { "content-type": "image/png", "content-range": "bytes 0-1/4", "x-content-type-options": "nosniff" },
        body: new Response("ab").body,
      },
    });
    const response = await download(
      new NextRequest(`http://localhost:4105/api/v1/files/${FILE_ID}/content?download=1`, {
        headers: { range: "bytes=0-1" },
      }),
      params,
    );
    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-1/4");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("ab");
    expect(interactors.readContent).toHaveBeenCalledWith({ fileId: FILE_ID, range: "bytes=0-1", download: true });
    expect(interactors.readByGrant).not.toHaveBeenCalled();
  });

  it("uses the signed link instead of the session when a token is present", async () => {
    interactors.readByGrant.mockResolvedValueOnce({
      ok: true,
      data: { status: 416, headers: { "content-range": "bytes */4" }, body: null },
    });
    const response = await download(
      new NextRequest(`http://localhost:4105/api/v1/files/${FILE_ID}/content?token=signed`),
      params,
    );
    expect(response.status).toBe(416);
    expect(interactors.readByGrant).toHaveBeenCalledWith({
      fileId: FILE_ID,
      range: null,
      download: false,
      token: "signed",
    });
    interactors.readByGrant.mockResolvedValueOnce(failure(CustomErrorCode.recordFileLinkInvalid));
    const expired = await download(
      new NextRequest(`http://localhost:4105/api/v1/files/${FILE_ID}/content?token=old`),
      params,
    );
    expect(expired.status).toBe(401);
  });

  it("hands the raw request body to the upload and answers with the stored size", async () => {
    interactors.uploadByGrant.mockImplementationOnce(async ({ body }: { body: ReadableStream<Uint8Array> }) => ({
      ok: true,
      data: { fileId: FILE_ID, size: (await new Response(body).arrayBuffer()).byteLength, sha256: "hash" },
    }));
    const response = await upload(
      new NextRequest(`http://localhost:4105/api/v1/files/${FILE_ID}/content?token=signed`, {
        method: "PUT",
        body: new Uint8Array([1, 2, 3]),
      }),
      params,
    );
    expect(await response.json()).toEqual({ fileId: FILE_ID, size: 3, sha256: "hash" });
    expect(interactors.uploadByGrant).toHaveBeenCalledWith(
      expect.objectContaining({ fileId: FILE_ID, token: "signed" }),
    );

    interactors.uploadContent.mockResolvedValueOnce(failure(CustomErrorCode.recordFileUploadIncomplete));
    const refused = await upload(
      new NextRequest(`http://localhost:4105/api/v1/files/${FILE_ID}/content`, { method: "PUT", body: "x" }),
      params,
    );
    expect(refused.status).toBe(400);
    expect(interactors.uploadContent).toHaveBeenCalledWith(expect.objectContaining({ fileId: FILE_ID }));
  });
});
