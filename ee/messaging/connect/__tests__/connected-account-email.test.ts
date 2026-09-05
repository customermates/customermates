import type { ConnectedAccountRecord } from "../../messaging.schema";

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
vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { defaultEmailSettings } from "../../email-settings";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { GetMyConnectedAccountsInteractor } from "../get-my-connected-accounts.interactor";
import { SetConnectedAccountSignatureInteractor } from "../set-connected-account-signature.interactor";
import { toConnectedAccountDto } from "../connected-account-dto";

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
  beforeEach(() => vi.clearAllMocks());

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
    const repo = { setAccountSignatureOrThrow: vi.fn() };
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
});
