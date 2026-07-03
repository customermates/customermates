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
