import { describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
  getLocale: () => Promise.resolve("en"),
}));

import { runWithTenant } from "@/core/decorators/tenant-context";
import { SetConnectedAccountVisibilityInteractor } from "../set-connected-account-visibility.interactor";

const ID = "10000000-0000-4000-8000-000000000001";

describe("SetConnectedAccountVisibilityInteractor", () => {
  it("resolves the account before the plan check, so an unknown account is not found on every plan", async () => {
    const missing = Object.assign(new Error("No record was found"), { code: "P2025" });
    const repo = { getAccountByIdOrThrow: vi.fn().mockRejectedValue(missing), setAccountSharedOrThrow: vi.fn() };
    const entitlements = { require: vi.fn() };
    const interactor = new SetConnectedAccountVisibilityInteractor(
      repo as never,
      { publish: vi.fn() } as never,
      entitlements as never,
    );

    await expect(runWithTenant(mockUser, () => interactor.invoke({ id: ID, shared: false }))).rejects.toBe(missing);
    expect(entitlements.require).not.toHaveBeenCalled();
    expect(repo.setAccountSharedOrThrow).not.toHaveBeenCalled();
  });

  function interactorFor(shared: boolean, denied: unknown) {
    const account = {
      id: ID,
      shared,
      provider: "google",
      status: "ok",
      hasMessaging: true,
      hasCalendar: false,
      displayName: "Sales",
      emailAddress: "sales@example.test",
      syncing: false,
      lastSyncedAt: null,
      createdAt: new Date("2026-11-01T08:00:00.000Z"),
      owner: { userId: "20000000-0000-4000-8000-000000000002", firstName: "Mara", lastName: "Lind", avatarUrl: null },
      isOwner: true,
      folders: [],
      selectedFolderIds: [],
      foldersSyncedAt: null,
      linkedinProducts: [],
      signature: null,
      signatureFields: null,
    };
    const repo = {
      getAccountByIdOrThrow: vi.fn().mockResolvedValue(account),
      setAccountSharedOrThrow: vi
        .fn()
        .mockImplementation(({ shared: next }: { shared: boolean }) => Promise.resolve({ ...account, shared: next })),
    };
    const entitlements = { require: vi.fn().mockResolvedValue(denied) };
    const events = { publish: vi.fn().mockResolvedValue(undefined) };
    return {
      repo,
      entitlements,
      events,
      interactor: new SetConnectedAccountVisibilityInteractor(repo as never, events as never, entitlements as never),
    };
  }

  const DENIED = { ok: false, code: "sharedAccountsRequiresBusiness" };

  it("lets the owner stop sharing an account on a plan without shared accounts", async () => {
    const { interactor, repo, entitlements, events } = interactorFor(true, DENIED);

    const result = await runWithTenant(mockUser, () => interactor.invoke({ id: ID, shared: false }));

    expect(result).toMatchObject({ ok: true });
    expect(entitlements.require).not.toHaveBeenCalled();
    expect(repo.setAccountSharedOrThrow).toHaveBeenCalledWith({ id: ID, shared: false });
    expect(events.publish).toHaveBeenCalledOnce();
  });

  it("refuses to start sharing an account on a plan without shared accounts", async () => {
    const { interactor, repo, entitlements, events } = interactorFor(false, DENIED);

    const result = await runWithTenant(mockUser, () => interactor.invoke({ id: ID, shared: true }));

    expect(result).toBe(DENIED);
    expect(entitlements.require).toHaveBeenCalledWith("sharedAccounts");
    expect(repo.setAccountSharedOrThrow).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });

  it("shares an account when the plan includes shared accounts", async () => {
    const { interactor, repo } = interactorFor(false, null);

    const result = await runWithTenant(mockUser, () => interactor.invoke({ id: ID, shared: true }));

    expect(result).toMatchObject({ ok: true });
    expect(repo.setAccountSharedOrThrow).toHaveBeenCalledWith({ id: ID, shared: true });
  });

  it("answers an unchanged visibility without a write on any plan", async () => {
    const { interactor, repo, events } = interactorFor(true, DENIED);

    const result = await runWithTenant(mockUser, () => interactor.invoke({ id: ID, shared: true }));

    expect(result).toMatchObject({ ok: true });
    expect(repo.setAccountSharedOrThrow).not.toHaveBeenCalled();
    expect(events.publish).not.toHaveBeenCalled();
  });
});
