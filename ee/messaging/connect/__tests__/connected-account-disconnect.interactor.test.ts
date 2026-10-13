import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();
const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/node", () => sentry);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));

import { UnipileRequestError } from "@/ee/messaging/unipile-request-error";
import { DeleteConnectedAccountInteractor } from "../delete-connected-account.interactor";
import { ResyncConnectedAccountInteractor } from "../resync-connected-account.interactor";

const ACCOUNT_ID = "10000000-0000-4000-8000-000000000001";
const account = {
  id: ACCOUNT_ID,
  unipileAccountId: "provider-account-1",
  provider: "google",
  displayName: "Ada · Google",
  emailAddress: "ada@example.com",
};

function disconnect(providerDelete: () => Promise<void>) {
  const repo = {
    findAccountByIdOrThrow: vi.fn().mockResolvedValue(account),
    deleteAccount: vi.fn().mockResolvedValue(undefined),
  };
  const messagingService = { deleteAccount: vi.fn(providerDelete) };
  const eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  const interactor = new DeleteConnectedAccountInteractor(
    repo as never,
    messagingService as never,
    eventService as never,
  );
  return { interactor, repo, messagingService, eventService };
}

describe("DeleteConnectedAccountInteractor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes the workspace disconnect when the provider cannot be reached and defers the provider removal", async () => {
    const failure = new UnipileRequestError(0, null, "fetch failed");
    const { interactor, repo, messagingService, eventService } = disconnect(() => Promise.reject(failure));

    const result = await interactor.invoke({ id: ACCOUNT_ID });

    expect(result).toEqual({ ok: true, data: { id: ACCOUNT_ID, disconnected: true } });
    expect(repo.deleteAccount).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(eventService.publish).toHaveBeenCalledTimes(1);
    expect(messagingService.deleteAccount).toHaveBeenCalledWith({ accountId: "provider-account-1" });
    expect(sentry.captureException).toHaveBeenCalledWith(failure, {
      tags: { kind: "unipile-account-removal-deferred" },
    });
  });

  it("removes the provider account right away when the provider answers", async () => {
    const { interactor, messagingService } = disconnect(() => Promise.resolve());

    expect(await interactor.invoke({ id: ACCOUNT_ID })).toEqual({
      ok: true,
      data: { id: ACCOUNT_ID, disconnected: true },
    });
    expect(messagingService.deleteAccount).toHaveBeenCalledTimes(1);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("rejects unknown keys before removing anything", async () => {
    const { interactor, repo } = disconnect(() => Promise.resolve());

    const result = await interactor.invoke({ id: ACCOUNT_ID, force: true } as never);

    expect(result.ok).toBe(false);
    expect(repo.deleteAccount).not.toHaveBeenCalled();
  });
});

describe("ResyncConnectedAccountInteractor", () => {
  it("rejects a body key its schema does not declare", async () => {
    const repo = { findAccountByIdOrThrow: vi.fn() };
    const background = { dispatch: vi.fn() };
    const interactor = new ResyncConnectedAccountInteractor(
      repo as never,
      background as never,
      { publish: vi.fn() } as never,
      { require: vi.fn().mockResolvedValue(null) } as never,
    );

    const result = await interactor.invoke({ id: ACCOUNT_ID, full: true } as never);

    expect(result.ok).toBe(false);
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("returns the resync receipt after dispatching the backfill", async () => {
    const repo = { findAccountByIdOrThrow: vi.fn().mockResolvedValue(account) };
    const background = { dispatch: vi.fn().mockResolvedValue(undefined) };
    const interactor = new ResyncConnectedAccountInteractor(
      repo as never,
      background as never,
      { publish: vi.fn().mockResolvedValue(undefined) } as never,
      { require: vi.fn().mockResolvedValue(null) } as never,
    );

    expect(await interactor.invoke({ id: ACCOUNT_ID })).toEqual({
      ok: true,
      data: { id: ACCOUNT_ID, resyncStarted: true },
    });
    expect(background.dispatch).toHaveBeenCalledWith("backfill-connected-account", { connectedAccountId: ACCOUNT_ID });
  });
});
