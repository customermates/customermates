import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ENV_MODULE, createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";
import { CustomErrorCode } from "@/core/validation/validation.types";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));

const { CommentOnSocialPostInteractor } = await import("../comment-on-social-post.interactor");
const { ListManagedCompanyPagesInteractor } = await import("../list-managed-company-pages.interactor");

const ACCOUNT_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "44444444-4444-4444-8444-444444444444";
const PAGES = {
  data: [
    {
      object: "CompanyPage",
      id: "company_1",
      mailbox_id: "mb_1",
      name: "Acme",
    },
  ],
};

function make(provider = "linkedin", status = "ok") {
  const accountRepo = {
    findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue({ provider, status, unipileAccountId: "acc_1" }),
  };
  const messagingService = {
    addPostComment: vi.fn().mockResolvedValue({ ok: true, data: { id: "comment_2" } }),
    listManagedCompanyPages: vi.fn().mockResolvedValue({ ok: true, data: PAGES }),
  };
  const entitlements = { require: vi.fn().mockResolvedValue(null) };
  const records = {
    receipt: vi.fn().mockResolvedValue(null),
    saveReceipt: vi.fn().mockResolvedValue(undefined),
  };

  const interactor = new CommentOnSocialPostInteractor(
    accountRepo as never,
    messagingService as never,
    entitlements as never,
    records as never,
  );
  const pages = new ListManagedCompanyPagesInteractor(
    accountRepo as never,
    messagingService as never,
    entitlements as never,
  );

  return { interactor, pages, messagingService, records };
}

function errorCode(result: { ok: boolean; error?: unknown }) {
  return (result.error as { issues?: Array<{ params?: { error?: string } }> }).issues?.[0]?.params?.error;
}

beforeEach(() => vi.clearAllMocks());

describe("comment_on_social_post", () => {
  it("comments on the post and returns the comment id", async () => {
    const { interactor, messagingService, records } = make("instagram");

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      postId: "post_1",
      text: "Nice",
    });

    expect(result).toEqual({
      ok: true,
      data: { id: "comment_2", repeated: false },
    });
    expect(messagingService.addPostComment).toHaveBeenCalledWith({
      accountId: "acc_1",
      postId: "post_1",
      text: "Nice",
      replyToCommentId: undefined,
      commentAs: undefined,
    });
    expect(messagingService.listManagedCompanyPages).not.toHaveBeenCalled();
    expect(records.saveReceipt).not.toHaveBeenCalled();
  });

  it("replies to a comment as an administered company page", async () => {
    const { interactor, messagingService } = make();

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      postId: "post_1",
      text: "Thanks",
      replyToCommentId: "comment_1",
      commentAs: "company_1",
    });

    expect(result.ok).toBe(true);
    expect(messagingService.addPostComment).toHaveBeenCalledWith({
      accountId: "acc_1",
      postId: "post_1",
      text: "Thanks",
      replyToCommentId: "comment_1",
      commentAs: "company_1",
    });
  });

  it("returns the first result for a repeated idempotency key without commenting again", async () => {
    const { interactor, messagingService, records } = make();
    const input = {
      connectedAccountId: ACCOUNT_ID,
      postId: "post_1",
      text: "Nice",
      idempotencyKey: KEY,
    };
    await interactor.invoke(input);
    const [, , hash, saved] = records.saveReceipt.mock.calls[0];
    records.receipt.mockResolvedValue({ requestHash: hash, result: saved });

    const result = await interactor.invoke(input);

    expect(result).toEqual({
      ok: true,
      data: { id: "comment_2", repeated: true },
    });
    expect(messagingService.addPostComment).toHaveBeenCalledOnce();
  });

  it("refuses a used idempotency key with a different payload", async () => {
    const { interactor, messagingService, records } = make();
    records.receipt.mockResolvedValue({ requestHash: "other", result: {} });

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      postId: "post_1",
      text: "Nice",
      idempotencyKey: KEY,
    });

    expect(errorCode(result)).toBe(CustomErrorCode.recordIdempotencyConflict);
    expect(messagingService.addPostComment).not.toHaveBeenCalled();
  });

  it.each([
    ["a non-social account", "whatsapp", "ok", {}, CustomErrorCode.socialActionRequiresSocialAccount],
    ["an account that needs reconnecting", "linkedin", "credentials", {}, CustomErrorCode.unipileDisconnectedAccount],
    [
      "a company page on Instagram",
      "instagram",
      "ok",
      { commentAs: "company_1" },
      CustomErrorCode.linkedinProductRequiresLinkedin,
    ],
    [
      "a company page the account does not administer",
      "linkedin",
      "ok",
      { commentAs: "company_2" },
      CustomErrorCode.socialCompanyPageNotManaged,
    ],
  ] as const)("refuses %s without commenting", async (_, provider, status, extra, code) => {
    const { interactor, messagingService } = make(provider, status);

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      postId: "post_1",
      text: "Nice",
      ...extra,
    });

    expect(result.ok).toBe(false);
    expect(errorCode(result)).toBe(code);
    expect(messagingService.addPostComment).not.toHaveBeenCalled();
  });

  it("returns the provider failure and keeps the key free when commenting fails", async () => {
    const { interactor, messagingService, records } = make();
    messagingService.addPostComment.mockResolvedValue({
      ok: false,
      error: CustomErrorCode.unipileRateLimit,
    });

    const result = await interactor.invoke({
      connectedAccountId: ACCOUNT_ID,
      postId: "post_1",
      text: "Nice",
      idempotencyKey: KEY,
    });

    expect(errorCode(result)).toBe(CustomErrorCode.unipileRateLimit);
    expect(records.saveReceipt).not.toHaveBeenCalled();
  });
});

describe("list managed company pages", () => {
  it("returns the pages the LinkedIn account administers", async () => {
    const { pages, messagingService } = make();

    const result = await pages.invoke({ connectedAccountId: ACCOUNT_ID });

    expect(result).toEqual({ ok: true, data: PAGES });
    expect(messagingService.listManagedCompanyPages).toHaveBeenCalledWith({
      accountId: "acc_1",
    });
  });

  it("refuses an account that needs reconnecting", async () => {
    const { pages, messagingService } = make("linkedin", "credentials");

    const result = await pages.invoke({ connectedAccountId: ACCOUNT_ID });

    expect(errorCode(result)).toBe(CustomErrorCode.unipileDisconnectedAccount);
    expect(messagingService.listManagedCompanyPages).not.toHaveBeenCalled();
  });

  it("refuses an Instagram account", async () => {
    const { pages, messagingService } = make("instagram");

    const result = await pages.invoke({ connectedAccountId: ACCOUNT_ID });

    expect(errorCode(result)).toBe(CustomErrorCode.linkedinProductRequiresLinkedin);
    expect(messagingService.listManagedCompanyPages).not.toHaveBeenCalled();
  });
});
