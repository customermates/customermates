import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => ({ env: { ...MOCK_ENV_MODULE.env, UNIPILE_API_KEY: "test-key" } }));
vi.mock("@/core/di", () => ({ ...createMockDiModule(() => mockUser) }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/node", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }));

import { z } from "zod";
import * as Sentry from "@sentry/node";

import { CustomErrorCode } from "@/core/validation/validation.types";
import { MessagingService } from "../messaging.service";
import { ProcessAccountReconnectWebhookInteractor } from "../webhooks/account/process-account-reconnect-webhook.interactor";
import { PrepareBackfillInteractor, ACCOUNT_WIDE_SOURCE } from "../ingest/backfill/prepare-backfill.interactor";

function stubFetch(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
      ),
  );
}

function firstRequestUrl(): URL {
  const input = vi.mocked(fetch).mock.calls[0][0];
  return new URL(input instanceof Request ? input.url : String(input));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("MessagingService boundary validation", () => {
  it("getAccount returns the parsed snapshot for a valid response", async () => {
    stubFetch({ object: "Account", id: "acc_1", status: "running", provider: "linkedin", name: "Ben" });

    const account = await new MessagingService().getAccount("acc_1");

    expect(account.id).toBe("acc_1");
    expect(account.status).toBe("running");
  });

  it("getAccount throws a ZodError on an invalid response without capturing to Sentry itself", async () => {
    stubFetch({ object: "Account", status: "running" });

    const call = new MessagingService().getAccount("acc_1");

    await expect(call).rejects.toBeInstanceOf(z.ZodError);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("sendEmail throws a ZodError when the response misses id or message_id", async () => {
    stubFetch({ object: "EmailSent" });

    const call = new MessagingService().sendEmail({
      accountId: "acc_1",
      to: [{ email: "a@b.c" }],
      subject: "s",
      body: "<p>hi</p>",
    });

    await expect(call).rejects.toBeInstanceOf(z.ZodError);
  });
});

describe("social profile identifier routing", () => {
  it.each(["me", "ada-lovelace", "ACoAAExampleProviderId"])(
    "passes the documented person identifier %s to the user-profile route",
    async (identifier) => {
      stubFetch({ object: "UserProfile", id: "ACoAAResult", display_name: "Ada Lovelace" });

      const result = await new MessagingService().getSocialProfile({ accountId: "acc_1", identifier });

      expect(result).toMatchObject({ ok: true, data: { id: "ACoAAResult", display_name: "Ada Lovelace" } });
      expect(firstRequestUrl().pathname).toBe(`/v2/acc_1/users/${identifier}`);
    },
  );

  it("uses the dedicated LinkedIn company route and normalizes its response", async () => {
    stubFetch({
      object: "CompanyProfile",
      id: "1035",
      name: "Example Company",
      public_identifier: "example-company",
      tagline: "Useful software",
      followers_count: 42,
      locations: [{ is_headquarter: true, city: "Berlin", country_code: "DE" }],
      industry: ["Software Development", "CRM"],
      website: "https://example.com",
    });

    const result = await new MessagingService().getSocialProfile({
      accountId: "acc_1",
      identifier: "1035",
      profileType: "company",
    });

    expect(firstRequestUrl().pathname).toBe("/v2/acc_1/linkedin/company/1035");
    expect(result).toEqual({
      ok: true,
      data: expect.objectContaining({
        object: "CompanyProfile",
        id: "1035",
        type: "organization",
        display_name: "Example Company",
        specifics: expect.objectContaining({
          headline: "Useful software",
          location: "Berlin, DE",
          industry: "Software Development, CRM",
          followers_count: 42,
          website_url: "https://example.com",
        }),
      }),
    });
  });

  it.each(["getSocialProfile", "getProviderProfile"] as const)(
    "maps an invalid user id from %s to a normal invalid request without Sentry noise",
    async (method) => {
      stubFetch({ type: "api/invalid_parameters", detail: "Invalid User ID." }, 400);
      const service = new MessagingService();

      const result = await service[method]({ accountId: "acc_1", identifier: "not-a-provider-id" });

      expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileInvalidRequest });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    },
  );

  it("maps an invalid company id to a normal invalid request without Sentry noise", async () => {
    stubFetch({ type: "api/invalid_parameters", detail: "Invalid Company ID." }, 400);

    const result = await new MessagingService().getSocialProfile({
      accountId: "acc_1",
      identifier: "not-a-provider-id",
      profileType: "company",
    });

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileInvalidRequest });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("keeps unrelated api/invalid_parameters failures visible in Sentry", async () => {
    stubFetch({ type: "api/invalid_parameters", detail: "with_sections has an invalid value." }, 400);

    const result = await new MessagingService().getSocialProfile({
      accountId: "acc_1",
      identifier: "ACoAAExampleProviderId",
    });

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileUnknown });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ unipileDetail: "with_sections has an invalid value." }),
      }),
    );
  });
});

describe("social post pagination", () => {
  const page = { data: [], total_count: 0, next_cursor: null };

  it("maps an invalid author id to a normal invalid request without Sentry noise", async () => {
    stubFetch({ type: "api/invalid_parameters", detail: "Invalid User ID." }, 400);

    const result = await new MessagingService().listUserPosts({
      accountId: "acc_1",
      userId: "not-a-provider-id",
    });

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileInvalidRequest });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("keeps a positive offset for providers that support offset pagination", async () => {
    stubFetch(page);

    await new MessagingService().listUserPosts({ accountId: "acc_1", userId: "me", offset: 20, limit: 20 });

    expect(firstRequestUrl().searchParams.get("offset")).toBe("20");
  });

  it("maps a cursor-required response for an explicit offset without capturing it", async () => {
    stubFetch({ type: "api/invalid_parameters", detail: "This feature uses cursor for pagination." }, 400);

    const result = await new MessagingService().listUserPosts({ accountId: "acc_1", userId: "me", offset: 20 });

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileInvalidRequest });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("captures the same provider response when no offset selected the wrong mode", async () => {
    stubFetch({ type: "api/invalid_parameters", detail: "This feature uses cursor for pagination." }, 400);

    const result = await new MessagingService().listUserPosts({ accountId: "acc_1", userId: "me" });

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileUnknown });
    expect(Sentry.captureException).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        tags: expect.objectContaining({ unipileDetail: "This feature uses cursor for pagination." }),
      }),
    );
  });
});

describe("deleteAccount tolerance", () => {
  it("tolerates a 404 (account already gone at Unipile)", async () => {
    stubFetch({ type: "provider/resource_not_found" }, 404);

    await expect(new MessagingService().deleteAccount({ accountId: "acc_1" })).resolves.toBeUndefined();
  });

  it("tolerates a 410 (account already gone at Unipile)", async () => {
    stubFetch({ type: "api/gone" }, 410);

    await expect(new MessagingService().deleteAccount({ accountId: "acc_1" })).resolves.toBeUndefined();
  });

  it("propagates other errors instead of swallowing them", async () => {
    stubFetch({ type: "api/internal_error" }, 500);

    await expect(new MessagingService().deleteAccount({ accountId: "acc_1" })).rejects.toThrow("request failed: 500");
  });
});

describe("downloadAttachment email fallback", () => {
  const requestUrl = (input: RequestInfo | URL): string => (input instanceof Request ? input.url : String(input));

  const notFound = () =>
    new Response(JSON.stringify({ type: "provider/resource_not_found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

  it("re-resolves a stale email attachment id by fileName and size, then downloads", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/attachments/part_2")) {
        return Promise.resolve(
          new Response("hello world!", { status: 200, headers: { "content-type": "text/plain" } }),
        );
      }
      if (url.includes("/attachments/")) return Promise.resolve(notFound());
      if (url.endsWith("/emails/email-1")) {
        return Promise.resolve(
          json({ id: "email-1", attachments: [{ id: "part_2", filename: "doc.txt", file_size: 12 }] }),
        );
      }

      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await new MessagingService().downloadAttachment({
      accountId: "acc_1",
      provider: "mail" as any,
      chatId: null,
      messageId: "email-1",
      attachmentId: "stale-cid@outlook.com",
      fileName: "doc.txt",
      size: 12,
    });

    const text = await new Response(result.body).text();
    expect(text).toBe("hello world!");
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("propagates the not-found when the fresh email has no matching attachment", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (url.includes("/attachments/")) return Promise.resolve(notFound());
      if (url.endsWith("/emails/email-1")) return Promise.resolve(json({ id: "email-1", attachments: [] }));

      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const call = new MessagingService().downloadAttachment({
      accountId: "acc_1",
      provider: "mail" as any,
      chatId: null,
      messageId: "email-1",
      attachmentId: "gone@outlook.com",
      fileName: "doc.txt",
      size: 12,
    });

    await expect(call).rejects.toThrow("request failed: 404");
  });
});

describe("startChat routing and 5xx capture", () => {
  const requestUrl = (input: RequestInfo | URL): string => (input instanceof Request ? input.url : String(input));

  it("targets the inbox send endpoint when inboxId is set and parses the started chat", async () => {
    stubFetch({ object: "ChatStarted", chat_id: "c1", message_id: "m1" });

    const result = await new MessagingService().startChat({
      accountId: "acc_1",
      usersIds: ["u1"],
      text: "hi",
      inboxId: "CLASSIC_PRIMARY",
    });

    expect(result).toEqual({ ok: true, data: { chatId: "c1", messageId: "m1" } });
    expect(requestUrl(vi.mocked(fetch).mock.calls[0][0])).toContain("/inboxes/CLASSIC_PRIMARY/chats/send");
  });

  it("targets the account-scoped send endpoint without inboxId", async () => {
    stubFetch({ object: "ChatStarted", chat_id: "c1", message_id: "m1" });

    const result = await new MessagingService().startChat({ accountId: "acc_1", usersIds: ["u1"], text: "hi" });

    expect(result).toEqual({ ok: true, data: { chatId: "c1", messageId: "m1" } });
    const url = requestUrl(vi.mocked(fetch).mock.calls[0][0]);
    expect(url).toContain("/chats/send");
    expect(url).not.toContain("/inboxes/");
  });

  it("takes the first message id when the response returns an array", async () => {
    stubFetch({ object: "ChatStarted", chat_id: "c1", message_id: ["m1", "m2"] });

    const result = await new MessagingService().startChat({ accountId: "acc_1", usersIds: ["u1"], text: "hi" });

    expect(result).toEqual({ ok: true, data: { chatId: "c1", messageId: "m1" } });
  });

  it("captures a non-transient 5xx send failure with endpoint tags", async () => {
    stubFetch({ type: "api/internal_error" }, 500);

    const result = await new MessagingService().startChat({ accountId: "acc_1", usersIds: ["u1"], text: "hi" });

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileServiceUnavailable });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: {
        unipileStatus: "500",
        unipileErrorType: "api/internal_error",
        unipileEndpoint: "unknown",
        unipileDetail: "none",
        unipileRequestId: "none",
      },
    });
  });

  it("does not capture transient proxy 5xx failures", async () => {
    stubFetch({ type: "api/proxy_error" }, 502);

    const result = await new MessagingService().startChat({ accountId: "acc_1", usersIds: ["u1"], text: "hi" });

    expect(result).toEqual({ ok: false, error: CustomErrorCode.unipileServiceUnavailable });
    expect(Sentry.captureException).not.toHaveBeenCalled();
    expect(Sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe("getAccount consumer drift policies", () => {
  const account = {
    id: "11111111-1111-4111-8111-111111111111",
    companyId: "co-1",
    unipileAccountId: "acc_uni-1",
    provider: "whatsapp",
    status: "ok",
    backfillClaimToken: "tok-1",
    hasMessaging: true,
    hasCalendar: false,
  } as any;

  it("reconnect defaults the status to ok on drift and still updates + dispatches", async () => {
    const messagingService = { getAccount: vi.fn().mockRejectedValue(new z.ZodError([])) };
    const repo = {
      findAccountByUnipileIdOrThrowUnscoped: vi.fn().mockResolvedValue(account),
      findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue(account),
      updateAccountUnscoped: vi.fn().mockResolvedValue(undefined),
    };
    const backgroundTaskService = { dispatch: vi.fn().mockResolvedValue(undefined) };
    const interactor = new ProcessAccountReconnectWebhookInteractor(
      messagingService as any,
      repo as any,
      backgroundTaskService as any,
    );

    await interactor.invoke({ type: "account.reconnect", account_id: "acc_uni-1" });

    expect(repo.updateAccountUnscoped).toHaveBeenCalledWith({ unipileAccountId: "acc_uni-1", status: "ok" });
    expect(backgroundTaskService.dispatch).toHaveBeenCalledWith("backfill-connected-account", {
      connectedAccountId: account.id,
    });
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(z.ZodError), {
      tags: { unipileAccountId: "acc_uni-1" },
    });
  });

  it("reconnect propagates non-drift errors without updating", async () => {
    const messagingService = { getAccount: vi.fn().mockRejectedValue(new Error("Unipile v2 request failed: 500")) };
    const repo = {
      findAccountByUnipileIdOrThrowUnscoped: vi.fn().mockResolvedValue(account),
      findAccountByUnipileIdUnscoped: vi.fn().mockResolvedValue(account),
      updateAccountUnscoped: vi.fn().mockResolvedValue(undefined),
    };
    const backgroundTaskService = { dispatch: vi.fn() };
    const interactor = new ProcessAccountReconnectWebhookInteractor(
      messagingService as any,
      repo as any,
      backgroundTaskService as any,
    );

    await expect(interactor.invoke({ type: "account.reconnect", account_id: "acc_uni-1" })).rejects.toThrow("500");
    expect(repo.updateAccountUnscoped).not.toHaveBeenCalled();
  });

  it("prepare-backfill degrades to DB-known features on drift", async () => {
    const messagingService = { getAccount: vi.fn().mockRejectedValue(new z.ZodError([])) };
    const repo = {
      findAccountByIdUnscoped: vi.fn().mockResolvedValue(account),
      updateAccountUnscoped: vi.fn().mockResolvedValue(undefined),
    };
    const interactor = new PrepareBackfillInteractor(repo as any, messagingService as any);

    const plan = await interactor.invoke({ connectedAccountId: account.id, token: "tok-1" });

    expect(plan).toEqual({ status: "ready", kind: "chat", sources: [ACCOUNT_WIDE_SOURCE], hasCalendar: false });
    expect(repo.updateAccountUnscoped).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(expect.any(z.ZodError), {
      tags: { unipileAccountId: account.unipileAccountId },
    });
  });
});

describe("Unipile failure diagnostics reach Sentry", () => {
  const notImplemented = {
    object: "Error",
    status: 501,
    type: "api/not_implemented",
    title: "Feature not implemented",
    detail: "List emails is only available when initial sync is enabled for this account.",
    req_id: "req-63hr",
  };

  it("reports a permanent provider limitation with its raw status, type, detail and req_id", async () => {
    stubFetch(notImplemented, 501);

    const result = await new MessagingService().getPost({ accountId: "acc_1", postId: "p1" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(CustomErrorCode.unipileFeatureUnavailable);
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(vi.mocked(Sentry.captureException).mock.calls[0][1]).toMatchObject({
      tags: {
        unipileStatus: "501",
        unipileErrorType: "api/not_implemented",
        unipileDetail: notImplemented.detail,
        unipileRequestId: "req-63hr",
      },
    });
  });

  it("reports an inactive Unipile subscription rather than swallowing it", async () => {
    stubFetch(
      { object: "Error", status: 403, type: "api/inactive_subscription", title: "Inactive", req_id: "req-9xy" },
      403,
    );

    const result = await new MessagingService().getPost({ accountId: "acc_1", postId: "p1" });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe(CustomErrorCode.unipileFeatureUnavailable);
    expect(Sentry.captureException).toHaveBeenCalledOnce();
    expect(vi.mocked(Sentry.captureException).mock.calls[0][1]).toMatchObject({
      tags: { unipileErrorType: "api/inactive_subscription", unipileRequestId: "req-9xy", unipileDetail: "none" },
    });
  });

  it("keeps a customer address out of the Sentry tags", async () => {
    stubFetch(
      {
        object: "Error",
        status: 500,
        type: "api/internal_error",
        title: "Internal Server Error",
        detail: "Delivery to buyer@example-customer.com failed permanently.",
        req_id: "req-priv",
      },
      500,
    );

    await new MessagingService().getPost({ accountId: "acc_1", postId: "p1" });

    const context = vi.mocked(Sentry.captureException).mock.calls[0][1] as { tags: Record<string, string> };
    const tags = context.tags;
    expect(tags.unipileDetail).toBe("Delivery to [redacted] failed permanently.");
    expect(tags.unipileDetail).not.toContain("@");
    expect(tags.unipileRequestId).toBe("req-priv");
  });

  it("keeps a genuinely transient proxy failure quiet and still temporary", async () => {
    stubFetch({ object: "Error", status: 502, type: "api/proxy_error", title: "Proxy", req_id: "req-1" }, 502);

    const result = await new MessagingService().getPost({ accountId: "acc_1", postId: "p1" });

    if (!result.ok) expect(result.error).toBe(CustomErrorCode.unipileServiceUnavailable);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("keeps an expected not-found quiet", async () => {
    stubFetch({ object: "Error", status: 404, type: "api/resource_not_found", title: "Nope", req_id: "req-2" }, 404);

    const result = await new MessagingService().getPost({ accountId: "acc_1", postId: "p1" });

    if (!result.ok) expect(result.error).toBe(CustomErrorCode.unipileResourceNotFound);
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });
});
