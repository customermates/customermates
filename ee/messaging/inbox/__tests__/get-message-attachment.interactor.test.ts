import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const routeInteractor = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => ({
  ...createMockDiModule(() => mockUser),
  getGetMessageAttachmentInteractor: () => routeInteractor.current,
}));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { GetMessageAttachmentInteractor } from "../get-message-attachment.interactor";
import { StructuredErrorResponseSchema } from "@/core/api/structured-interactor-handler";
import { GET } from "@/app/api/messaging/attachments/[messageId]/[attachmentId]/route";

function build() {
  const repo = { findAttachmentForMessageOrThrow: vi.fn() };
  const messagingService = { downloadAttachment: vi.fn() };
  const files = { file: vi.fn() };
  const driver = { read: vi.fn() };
  const interactor = new GetMessageAttachmentInteractor(
    repo,
    messagingService as never,
    mockEntitlementService(),
    files,
    () => driver as never,
  );
  return { interactor, repo, messagingService, files, driver };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GetMessageAttachmentInteractor", () => {
  it("returns a validation failure for a malformed message id instead of throwing", async () => {
    const { interactor, repo, messagingService } = build();

    const result = await interactor.invoke({ messageId: "abc123", attachmentId: "def456" });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues[0]).toMatchObject({ path: ["messageId"], format: "uuid" });
    expect(repo.findAttachmentForMessageOrThrow).not.toHaveBeenCalled();
    expect(messagingService.downloadAttachment).not.toHaveBeenCalled();
  });

  it("answers a malformed message id on the attachment route with HTTP 400", async () => {
    const { interactor, repo } = build();
    routeInteractor.current = interactor;

    const response = await GET(new NextRequest("http://localhost:4105/api/messaging/attachments/abc123/def456"), {
      params: Promise.resolve({ messageId: "abc123", attachmentId: "def456" }),
    });

    expect(response.status).toBe(400);
    expect(StructuredErrorResponseSchema.parse(await response.json()).error).toMatchObject({
      kind: "validation",
      issues: [{ path: ["messageId"], message: "Invalid UUID" }],
    });
    expect(repo.findAttachmentForMessageOrThrow).not.toHaveBeenCalled();
  });
});

describe("GetMessageAttachmentInteractor draft files", () => {
  const MESSAGE_ID = "00000000-0000-4000-8000-000000000031";
  const FILE_ID = "00000000-0000-4000-8000-000000000032";

  it("streams a draft's CRM file from storage instead of the provider", async () => {
    const { interactor, repo, messagingService, files, driver } = build();
    const stream = new ReadableStream<Uint8Array>();
    repo.findAttachmentForMessageOrThrow.mockResolvedValue({
      isDraft: true,
      fileId: FILE_ID,
    });
    files.file.mockResolvedValue({
      ok: true,
      data: {
        id: FILE_ID,
        name: "RE26110101.pdf",
        mimeType: "application/pdf",
        storageDriver: "database",
        storageKey: "k",
      },
    });
    driver.read.mockResolvedValue({
      stream,
      size: 5,
      contentType: "application/pdf",
    });

    const result = await interactor.invoke({
      messageId: MESSAGE_ID,
      attachmentId: FILE_ID,
    });

    expect(result).toEqual({
      ok: true,
      data: {
        body: stream,
        contentType: "application/pdf",
        fileName: "RE26110101.pdf",
      },
    });
    expect(files.file).toHaveBeenCalledWith(FILE_ID, {
      draftMessageId: MESSAGE_ID,
    });
    expect(messagingService.downloadAttachment).not.toHaveBeenCalled();
  });

  it("returns the access failure when the draft file is not readable", async () => {
    const { interactor, repo, files, driver } = build();
    const denied = { ok: false, error: { issues: [] } };
    repo.findAttachmentForMessageOrThrow.mockResolvedValue({
      isDraft: true,
      fileId: FILE_ID,
    });
    files.file.mockResolvedValue(denied);

    const result = await interactor.invoke({
      messageId: MESSAGE_ID,
      attachmentId: FILE_ID,
    });

    expect(result).toBe(denied);
    expect(driver.read).not.toHaveBeenCalled();
  });
});
