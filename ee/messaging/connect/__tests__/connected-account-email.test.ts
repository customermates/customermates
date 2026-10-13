import type { ConnectedAccountRecord } from "../../messaging.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser, createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

let mockUser = createMockUser();
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve(Object.assign((key: string) => key, { raw: (key: string) => key })),
}));

import { defaultEmailSettings } from "../../email-settings";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { GetMyConnectedAccountsInteractor } from "../get-my-connected-accounts.interactor";
import { GetMyConnectedAccountsApiInteractor } from "../get-my-connected-accounts-api.interactor";
import { SetConnectedAccountSignatureInteractor } from "../set-connected-account-signature.interactor";
import { toConnectedAccountDto } from "../connected-account-dto";
import { ForbiddenError } from "@/core/errors/app-errors";
import { Action, Resource } from "@/generated/prisma";

function account(isOwner = true): ConnectedAccountRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    provider: "google",
    status: "ok",
    hasMessaging: true,
    hasCalendar: false,
    emailAddress: "sender@example.com",
    displayName: "Sender",
    shared: true,
    syncing: false,
    lastSyncedAt: null,
    createdAt: new Date("2026-09-04T10:00:00.000Z"),
    owner: {
      userId: "00000000-0000-4000-8000-000000000002",
      firstName: "Account",
      lastName: "Owner",
      avatarUrl: null,
    },
    isOwner,
    folders: [],
    selectedFolderIds: [],
    foldersSyncedAt: null,
    linkedinProducts: [],
    signature: "**Saved footer**",
    signatureFields: defaultEmailSettings(),
  };
}

describe("connected-account email presentation at the interactor boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = createMockUser();
  });

  it.each([true, false])(
    "validates the public account output without exposing email presentation (owner=%s)",
    async (isOwner) => {
      const record = account(isOwner);
      const result = await new GetMyConnectedAccountsApiInteractor({
        listAccounts: vi.fn().mockResolvedValue([{ ...record, signatureHtml: "private HTML" }]),
      }).invoke();
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ id: record.id, emailAddress: record.emailAddress, isOwner });
      for (const key of ["signature", "signatureFields", "signatureHtml", "emailSettings"])
        expect(result.data[0]).not.toHaveProperty(key);

      expect(record.signature).toBe("**Saved footer**");
    },
  );

  it("rejects malformed public DTO data at the interactor output boundary", async () => {
    const interactor = new GetMyConnectedAccountsApiInteractor({
      listAccounts: vi.fn().mockResolvedValue([{ ...account(), id: "invalid-id" }]),
    });
    await expect(interactor.invoke()).rejects.toMatchObject({ name: "ZodError" });
  });

  it.each([Action.readOwn, Action.readAll])("allows the public list with %s permission", async (action) => {
    mockUser = createMockUserWithPermissions([{ resource: Resource.inboxMessages, action }]);
    const repo = { listAccounts: vi.fn().mockResolvedValue([account()]) };
    const result = await new GetMyConnectedAccountsApiInteractor(repo).invoke();
    expect(result.ok).toBe(true);
    expect(repo.listAccounts).toHaveBeenCalledOnce();
  });

  it("checks list permission before reading public account records", async () => {
    mockUser = createMockUserWithPermissions([]);
    const repo = { listAccounts: vi.fn() };
    await expect(new GetMyConnectedAccountsApiInteractor(repo).invoke()).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.listAccounts).not.toHaveBeenCalled();
  });

  it("keeps the owner's disabled content editable without rendering or leaking it to shared users", () => {
    expect(toConnectedAccountDto(account())).toMatchObject({
      signature: "**Saved footer**",
      signatureHtml: null,
    });
    expect(toConnectedAccountDto(account(false))).toMatchObject({
      signature: null,
      signatureHtml: null,
    });
  });

  it("maps persisted settings when listing accounts and omits the raw persistence field", async () => {
    const record = account();
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    record.signatureFields = settings;
    const result = await new GetMyConnectedAccountsInteractor({
      listAccounts: vi.fn().mockResolvedValue([record]),
    }).invoke();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data[0].signatureHtml).toContain("<strong>Saved footer</strong>");
    expect(result.data[0]).not.toHaveProperty("signatureFields");
    expect(record).not.toHaveProperty("signatureHtml");
  });

  it("validates the shared form contract before persistence and returns an expected failure", async () => {
    const repo = { findOwnedAccountEmail: vi.fn(), setAccountSignatureOrThrow: vi.fn() };
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    settings.signature.logoUrl = "https://localhost/logo.png";
    const result = await new SetConnectedAccountSignatureInteractor(repo, mockEntitlementService()).invoke({
      id: account().id,
      signature: "Saved footer",
      settings,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.issues).toContainEqual(
      expect.objectContaining({
        path: ["settings", "signature", "logoUrl"],
        params: { error: CustomErrorCode.invalidUrl },
      }),
    );
    expect(repo.setAccountSignatureOrThrow).not.toHaveBeenCalled();
  });

  it("normalizes signature input and presents the persisted record after a valid write", async () => {
    const record = account();
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    record.signatureFields = settings;
    const repo = {
      findOwnedAccountEmail: vi.fn().mockResolvedValue({ signature: "Old", settings: defaultEmailSettings() }),
      setAccountSignatureOrThrow: vi.fn().mockResolvedValue(record),
    };
    const result = await new SetConnectedAccountSignatureInteractor(repo, mockEntitlementService()).invoke({
      id: record.id,
      signature: "  **Saved footer**  ",
      settings,
    });

    expect(repo.setAccountSignatureOrThrow).toHaveBeenCalledExactlyOnceWith({
      id: record.id,
      signature: "**Saved footer**",
      settings,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.signatureHtml).toContain("<strong>Saved footer</strong>");
    expect(result.data).not.toHaveProperty("signatureFields");
  });

  it("keeps the stored settings when only the signature text changes, and the text when only settings change", async () => {
    const stored = defaultEmailSettings();
    stored.signature.enabled = true;
    const record = account();
    const repo = {
      findOwnedAccountEmail: vi.fn().mockResolvedValue({ signature: "**Saved footer**", settings: stored }),
      setAccountSignatureOrThrow: vi.fn().mockResolvedValue(record),
    };
    const interactor = new SetConnectedAccountSignatureInteractor(repo, mockEntitlementService());

    expect((await interactor.invoke({ id: record.id, signature: "Cheers" })).ok).toBe(true);
    const changed = defaultEmailSettings();
    expect((await interactor.invoke({ id: record.id, settings: changed })).ok).toBe(true);

    expect(repo.setAccountSignatureOrThrow.mock.calls).toEqual([
      [{ id: record.id, signature: "Cheers", settings: stored }],
      [{ id: record.id, signature: "**Saved footer**", settings: changed }],
    ]);
  });

  it("requires a signature or settings and answers not found for an account the caller does not own", async () => {
    const repo = { findOwnedAccountEmail: vi.fn().mockResolvedValue(null), setAccountSignatureOrThrow: vi.fn() };
    const interactor = new SetConnectedAccountSignatureInteractor(repo, mockEntitlementService());

    const empty = await interactor.invoke({ id: account().id });
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.error.issues[0]).toMatchObject({
        path: ["signature"],
        params: { error: CustomErrorCode.connectedAccountEmailChangeRequired },
      });
    }

    const foreign = await interactor.invoke({ id: account().id, signature: "Hi" });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) {
      expect(foreign.error.issues[0]).toMatchObject({
        path: ["id"],
        params: { error: CustomErrorCode.connectedAccountNotFound, kind: "not_found" },
      });
    }
    expect(repo.setAccountSignatureOrThrow).not.toHaveBeenCalled();
  });
});
