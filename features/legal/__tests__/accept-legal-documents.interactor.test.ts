import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "self-hosted",
}));
const mockLocale = vi.hoisted(() => ({ value: "de" }));
const runInTransaction = vi.hoisted(() => vi.fn((fn: () => Promise<unknown>) => fn()));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("next-intl/server", () => ({ getLocale: () => Promise.resolve(mockLocale.value) }));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction,
}));

import {
  LEGAL_CONTRACT_KEY,
  LEGAL_INFORMATION_KEY,
  currentLegalDocumentVersions,
  type LegalAcceptanceAuditPayload,
  type LegalNoticeAuditPayload,
} from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";
import { ForbiddenError } from "@/core/errors/app-errors";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { AcceptLegalDocumentsInteractor, type AcceptLegalDocumentsData } from "../accept-legal-documents.interactor";
import type { LegalAuditRecord, LegalAuditRepo } from "../get-legal-status.interactor";

const user = createMockUser({
  id: "admin-1",
  companyId: "company-1",
  email: "admin@example.com",
});

function contractNotice(): LegalAuditRecord {
  const payload: LegalNoticeAuditPayload = {
    versions: currentLegalDocumentVersions(),
    contractKey: LEGAL_CONTRACT_KEY,
    informationKey: LEGAL_INFORMATION_KEY,
    changedDocuments: ["terms", "dpa"],
    recipient: { id: user.id, email: user.email },
    locale: "en",
    noticeAt: "2026-08-07T00:00:00.000Z",
    effectiveAt: "2026-08-21T00:00:00.000Z",
    providerMessageId: "message-1",
    deployedGitCommit: "a".repeat(40),
    acceptanceType: null,
  };
  return {
    createdAt: new Date(payload.noticeAt),
    entityId: LEGAL_CONTRACT_KEY,
    eventData: {
      event: DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
      companyId: user.companyId,
      payload,
    },
    userId: user.id,
  };
}

function acceptanceRecord(): LegalAuditRecord {
  const payload: LegalAcceptanceAuditPayload = {
    versions: currentLegalDocumentVersions(),
    contractKey: LEGAL_CONTRACT_KEY,
    informationKey: LEGAL_INFORMATION_KEY,
    changedDocuments: ["terms", "dpa"],
    acceptingUser: { id: user.id, email: user.email },
    locale: "en",
    noticeAt: "2026-08-07T00:00:00.000Z",
    effectiveAt: "2026-08-21T00:00:00.000Z",
    providerMessageId: "message-1",
    deployedGitCommit: "a".repeat(40),
    acceptanceType: "later-update",
  };
  return {
    createdAt: new Date("2026-08-08T00:00:00.000Z"),
    entityId: LEGAL_CONTRACT_KEY,
    eventData: {
      event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
      companyId: user.companyId,
      payload,
    },
    userId: user.id,
  };
}

describe("AcceptLegalDocumentsInteractor", () => {
  let userService: { getActiveUserOrThrow: ReturnType<typeof vi.fn> };
  let auditRepo: LegalAuditRepo;
  let findLegalEventUnscoped: ReturnType<typeof vi.fn>;
  let eventService: { publish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    runInTransaction.mockImplementation((fn: () => Promise<unknown>) => {
      expect(getTenantUser().id).toBe(user.id);
      return fn();
    });
    mockEnv.APP_MODE = "cloud";
    mockLocale.value = "de";
    userService = { getActiveUserOrThrow: vi.fn().mockResolvedValue(user) };
    findLegalEventUnscoped = vi.fn((args) =>
      Promise.resolve(args.event === DomainEvent.LEGAL_CONTRACT_NOTICE_SENT ? contractNotice() : null),
    );
    auditRepo = { findLegalEventUnscoped } as LegalAuditRepo;
    eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  function interactor() {
    return new AcceptLegalDocumentsInteractor(userService as never, auditRepo, eventService as never);
  }

  it("records a later company-wide acceptance from an authorised administrator", async () => {
    await expect(interactor().invoke({ agreeToLegalDocuments: true })).resolves.toEqual({
      ok: true,
      data: { agreeToLegalDocuments: true },
    });

    expect(runInTransaction).toHaveBeenCalledWith(expect.any(Function), {
      companyId: user.companyId,
    });
    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, {
      entityId: LEGAL_CONTRACT_KEY,
      payload: expect.objectContaining({
        acceptanceType: "later-update",
        acceptingUser: { id: user.id, email: user.email },
        changedDocuments: ["terms", "dpa"],
        contractKey: LEGAL_CONTRACT_KEY,
        deployedGitCommit: "a".repeat(40),
        effectiveAt: "2026-08-21T00:00:00.000Z",
        informationKey: LEGAL_INFORMATION_KEY,
        locale: "de",
        noticeAt: "2026-08-07T00:00:00.000Z",
        providerMessageId: "message-1",
        versions: currentLegalDocumentVersions(),
      }),
    });
  });

  it("is idempotent when the current contract acceptance already exists", async () => {
    findLegalEventUnscoped.mockResolvedValue(acceptanceRecord());

    await interactor().invoke({ agreeToLegalDocuments: true });

    expect(findLegalEventUnscoped).toHaveBeenCalledTimes(1);
    expect(findLegalEventUnscoped).toHaveBeenCalledWith({
      companyId: user.companyId,
      entityId: LEGAL_CONTRACT_KEY,
      event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
      order: "desc",
    });
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("rejects acceptance before the current contract notice was delivered", async () => {
    findLegalEventUnscoped.mockResolvedValue(null);

    await expect(interactor().invoke({ agreeToLegalDocuments: true })).rejects.toThrow(
      "The current legal update has not been delivered to the company",
    );
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("rejects non-administrators and self-hosted installations", async () => {
    if (!user.role) throw new Error("Expected the fixture user to have a role");
    userService.getActiveUserOrThrow.mockResolvedValue(
      createMockUser({
        role: { ...user.role, isSystemRole: false },
      }),
    );
    await expect(interactor().invoke({ agreeToLegalDocuments: true })).rejects.toBeInstanceOf(ForbiddenError);

    userService.getActiveUserOrThrow.mockResolvedValue(user);
    mockEnv.APP_MODE = "self-hosted";
    await expect(interactor().invoke({ agreeToLegalDocuments: true })).rejects.toBeInstanceOf(ForbiddenError);
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("requires the explicit acceptance checkbox", async () => {
    const result = await interactor().invoke({
      agreeToLegalDocuments: false,
    } as unknown as AcceptLegalDocumentsData);

    expect(result.ok).toBe(false);
    expect(userService.getActiveUserOrThrow).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });
});
