import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { streamOfBytes } from "@/core/storage/read-capped-stream";
import { CustomErrorCode } from "@/core/validation/validation.types";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));

const { PublishSocialPostInteractor, SOCIAL_POST_ATTACHMENTS_MAX_BYTES } = await import(
  "../publish-social-post.interactor"
);

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const FILE_A = "22222222-2222-4222-8222-222222222222";
const FILE_B = "33333333-3333-4333-8333-333333333333";
const KEY = "44444444-4444-4444-8444-444444444444";

const POST = {
  object: "Post",
  id: "post_1",
  share_url: "https://www.linkedin.com/feed/update/1",
  created_at: "2026",
};

function make(provider = "linkedin", status = "ok") {
  const accountRepo = {
    findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue({ provider, status, unipileAccountId: "acc_1" }),
  };
  const messagingService = {
    createPost: vi.fn().mockResolvedValue({ ok: true, data: POST }),
    addPostComment: vi.fn().mockResolvedValue({ ok: true, data: { id: "comment_1" } }),
  };
  const entitlements = { require: vi.fn().mockResolvedValue(null) };
  const records = {
    receipt: vi.fn().mockResolvedValue(null),
    saveReceipt: vi.fn().mockResolvedValue(undefined),
  };
  const stored: Record<string, { name: string; mimeType: string; bytes: Uint8Array }> = {
    [FILE_A]: {
      name: "slide-1.png",
      mimeType: "image/png",
      bytes: new TextEncoder().encode("first"),
    },
    [FILE_B]: {
      name: "slide-2.png",
      mimeType: "image/png",
      bytes: new TextEncoder().encode("second"),
    },
  };
  const files = {
    readableFile: vi.fn((fileId: string) => {
      const file = stored[fileId];
      if (!file) {
        return Promise.resolve({
          ok: false,
          error: new Error("recordFileNotFound"),
        });
      }
      return Promise.resolve({
        ok: true,
        data: {
          id: fileId,
          name: file.name,
          mimeType: file.mimeType,
          size: file.bytes.byteLength,
          storageDriver: "local",
          storageKey: fileId,
        },
      });
    }),
  };
  const read = vi.fn((key: string) => Promise.resolve({ stream: streamOfBytes(stored[key].bytes) }));
  const drivers = vi.fn(() => ({ read }));

  const interactor = new PublishSocialPostInteractor(
    accountRepo as never,
    messagingService as never,
    entitlements as never,
    records as never,
    files as never,
    drivers as never,
  );

  return { interactor, messagingService, records, files, stored };
}

function errorCode(result: { ok: boolean; error?: unknown }) {
  return (result.error as { issues?: Array<{ params?: { error?: string } }> }).issues?.[0]?.params?.error;
}

beforeEach(() => vi.clearAllMocks());

describe("publish_social_post", () => {
  it("publishes the text with the LinkedIn visibility and returns the post", async () => {
    const { interactor, messagingService, records } = make();

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "Hello",
      visibility: "anyone",
    });

    expect(result).toEqual({
      ok: true,
      data: {
        id: "post_1",
        share_url: POST.share_url,
        created_at: "2026",
        comment_id: null,
        comment_error: null,
        repeated: false,
      },
    });
    expect(messagingService.createPost).toHaveBeenCalledWith({
      accountId: "acc_1",
      text: "Hello",
      attachments: undefined,
      canRead: "anyone",
    });
    expect(messagingService.addPostComment).not.toHaveBeenCalled();
    expect(records.saveReceipt).not.toHaveBeenCalled();
  });

  it("attaches readable record files in the given order", async () => {
    const { interactor, messagingService, files } = make("instagram");

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "",
      fileIds: [FILE_B, FILE_A],
    });

    expect(result.ok).toBe(true);
    expect(files.readableFile.mock.calls.map(([id]) => id)).toEqual([FILE_B, FILE_A]);
    expect(messagingService.createPost.mock.calls[0][0].attachments).toEqual([
      {
        filename: "slide-2.png",
        content_type: "image/png",
        content: Buffer.from("second").toString("base64"),
      },
      {
        filename: "slide-1.png",
        content_type: "image/png",
        content: Buffer.from("first").toString("base64"),
      },
    ]);
  });

  it("posts the first comment on the new post", async () => {
    const { interactor, messagingService } = make();

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "Hello",
      firstComment: "Link",
    });

    expect(messagingService.addPostComment).toHaveBeenCalledWith({
      accountId: "acc_1",
      postId: "post_1",
      text: "Link",
    });
    expect(result.ok && result.data.comment_id).toBe("comment_1");
  });

  it("keeps the published post and names the reason when the first comment fails", async () => {
    const { interactor, messagingService, records } = make();
    messagingService.addPostComment.mockResolvedValue({
      ok: false,
      error: CustomErrorCode.unipileRateLimit,
    });

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "Hello",
      firstComment: "Link",
      idempotencyKey: KEY,
    });

    expect(result).toMatchObject({
      ok: true,
      data: {
        id: "post_1",
        comment_id: null,
        comment_error: CustomErrorCode.unipileRateLimit,
      },
    });
    expect(records.saveReceipt).toHaveBeenCalledOnce();
  });

  it("returns the first result for a repeated idempotency key without publishing again", async () => {
    const { interactor, messagingService, records } = make();
    await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "Hello",
      idempotencyKey: KEY,
    });
    const [, , hash, saved] = records.saveReceipt.mock.calls[0];
    records.receipt.mockResolvedValue({ requestHash: hash, result: saved });

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "Hello",
      idempotencyKey: KEY,
    });

    expect(result).toMatchObject({
      ok: true,
      data: { id: "post_1", repeated: true },
    });
    expect(messagingService.createPost).toHaveBeenCalledOnce();
  });

  it("refuses a used idempotency key with a different payload", async () => {
    const { interactor, messagingService, records } = make();
    records.receipt.mockResolvedValue({ requestHash: "other", result: {} });

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "Hello",
      idempotencyKey: KEY,
    });

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe(CustomErrorCode.recordIdempotencyConflict);
    expect(messagingService.createPost).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-social account", "whatsapp", "ok", {}, CustomErrorCode.socialActionRequiresSocialAccount],
    ["an account that needs reconnecting", "linkedin", "credentials", {}, CustomErrorCode.unipileDisconnectedAccount],
    [
      "visibility on Instagram",
      "instagram",
      "ok",
      { visibility: "relations_only" },
      CustomErrorCode.linkedinProductRequiresLinkedin,
    ],
  ] as const)("refuses %s without publishing", async (_, provider, status, extra, code) => {
    const { interactor, messagingService } = make(provider, status);

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "Hello",
      ...extra,
    });

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe(code);
    expect(messagingService.createPost).not.toHaveBeenCalled();
  });

  it("refuses an unreadable file without publishing", async () => {
    const { interactor, messagingService } = make();

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "Hello",
      fileIds: ["55555555-5555-4555-8555-555555555555"],
    });

    expect(result.ok).toBe(false);
    expect(messagingService.createPost).not.toHaveBeenCalled();
  });

  it("refuses files above the attachment limit without publishing", async () => {
    const { interactor, messagingService, stored } = make();
    stored[FILE_A].bytes = new Uint8Array(SOCIAL_POST_ATTACHMENTS_MAX_BYTES + 1);

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "Hello",
      fileIds: [FILE_A],
    });

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe(CustomErrorCode.recordFileTooLarge);
    expect(messagingService.createPost).not.toHaveBeenCalled();
  });

  it("requires text or a file", async () => {
    const { interactor, messagingService } = make();

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "  ",
    });

    expect(result.ok).toBe(false);
    expect(messagingService.createPost).not.toHaveBeenCalled();
  });

  it("returns the provider failure and keeps the key free when publishing fails", async () => {
    const { interactor, messagingService, records } = make();
    messagingService.createPost.mockResolvedValue({
      ok: false,
      error: CustomErrorCode.unipileInvalidRequest,
    });

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      text: "Hello",
      idempotencyKey: KEY,
    });

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe(CustomErrorCode.unipileInvalidRequest);
    expect(records.saveReceipt).not.toHaveBeenCalled();
  });
});
