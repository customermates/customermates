import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve("en"),
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { CustomErrorCode } from "@/core/validation/validation.types";
import { EMAIL_FILE_ATTACHMENTS_MAX_BYTES, EmailFileAttachments, draftFileIds } from "../email-file-attachments";

const BOUND_ID = "00000000-0000-4000-8000-000000000041";
const RECORD_ID = "00000000-0000-4000-8000-000000000042";

function file(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `${id}.pdf`,
    mimeType: "application/pdf",
    size: 4,
    status: "pending" as const,
    fieldId: null,
    storageDriver: "database",
    storageKey: `key-${id}`,
    ...overrides,
  };
}

function streamOf(text: string) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function setup() {
  const repo = { findDraftFiles: vi.fn().mockResolvedValue([]) };
  const access = { readableFile: vi.fn() };
  const driver = { read: vi.fn() };
  const binding = { bindDraftFiles: vi.fn() };
  const service = new EmailFileAttachments(repo, access, () => driver as never, binding);
  return { service, repo, access, driver };
}

function errorCode(result: { ok: boolean; error?: unknown }) {
  return (result as { error: { issues: { params?: { error?: string } }[] } }).error.issues[0]?.params?.error;
}

describe("EmailFileAttachments", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses files bound to the draft without the uploader's access check", async () => {
    const { service, repo, access } = setup();
    repo.findDraftFiles.mockResolvedValue([file(BOUND_ID)]);

    const result = await service.describe([BOUND_ID], { threadId: "thread" });

    expect(result.ok).toBe(true);
    expect(access.readableFile).not.toHaveBeenCalled();
    expect(result.ok && result.data.attachmentsMeta).toEqual([
      expect.objectContaining({
        id: BOUND_ID,
        fileId: BOUND_ID,
        mime: "application/pdf",
        type: "file",
      }),
    ]);
  });

  it("binds pending uploads and only references files already on a record", async () => {
    const { service, access } = setup();
    access.readableFile.mockImplementation((id: string) =>
      Promise.resolve({
        ok: true,
        data: id === RECORD_ID ? file(id, { status: "ready", fieldId: "field" }) : file(id),
      }),
    );

    const result = await service.describe([BOUND_ID, RECORD_ID, BOUND_ID], null);

    expect(result.ok && result.data.bindFileIds).toEqual([BOUND_ID]);
    expect(result.ok && result.data.attachmentsMeta.map((meta) => meta.fileId)).toEqual([BOUND_ID, RECORD_ID]);
  });

  it("returns the access failure for a file the user cannot read", async () => {
    const { service, access } = setup();
    const denied = { ok: false, error: { issues: [] } };
    access.readableFile.mockResolvedValue(denied);

    expect(await service.describe([RECORD_ID], null)).toBe(denied);
  });

  it("refuses files that together exceed the size limit", async () => {
    const { service, repo } = setup();
    repo.findDraftFiles.mockResolvedValue([file(BOUND_ID, { size: EMAIL_FILE_ATTACHMENTS_MAX_BYTES + 1 })]);

    const result = await service.load([BOUND_ID], { draftMessageId: "draft" });

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe(CustomErrorCode.recordFileTooLarge);
  });

  it("loads stored bytes as base64 attachments", async () => {
    const { service, repo, driver } = setup();
    repo.findDraftFiles.mockResolvedValue([file(BOUND_ID)]);
    driver.read.mockResolvedValue({
      stream: streamOf("%PDF"),
      size: 4,
      contentType: "application/pdf",
    });

    const result = await service.load([BOUND_ID], { draftMessageId: "draft" });

    expect(result).toEqual({
      ok: true,
      data: [
        {
          filename: `${BOUND_ID}.pdf`,
          content_type: "application/pdf",
          content: "JVBERg==",
        },
      ],
    });
    expect(driver.read).toHaveBeenCalledWith(`key-${BOUND_ID}`);
  });

  it("reports a file whose bytes are missing from storage", async () => {
    const { service, repo, driver } = setup();
    repo.findDraftFiles.mockResolvedValue([file(BOUND_ID)]);
    driver.read.mockResolvedValue(null);

    const result = await service.load([BOUND_ID], { draftMessageId: "draft" });

    expect(errorCode(result)).toBe(CustomErrorCode.recordFileNotFound);
  });

  it("reads file ids from draft attachment metadata", () => {
    expect(draftFileIds([{ fileId: BOUND_ID }, { fileId: null }, {}])).toEqual([BOUND_ID]);
  });
});
