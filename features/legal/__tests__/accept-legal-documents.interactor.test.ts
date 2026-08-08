import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import { createMockDiModule, MOCK_ZOD_MODULE } from "@/tests/helpers/interactor-test-setup";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "self-hosted",
}));
const mockLocale = vi.hoisted(() => ({ value: "de" }));
const runInTransaction = vi.hoisted(() => vi.fn((fn: () => Promise<unknown>) => fn()));
let mockUser = createMockUser({
  id: "admin-1",
  companyId: "company-1",
  email: "admin@example.com",
});

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("next-intl/server", () => ({
  getLocale: () => Promise.resolve(mockLocale.value),
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/core/decorators/transaction-runner", () => ({ runInTransaction }));

import {
  currentLegalDocumentVersions,
  type LegalAcceptanceAuditPayload,
  type LegalNoticeAuditPayload,
} from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";
import { ForbiddenError } from "@/core/errors/app-errors";
import { getTenantUser } from "@/core/decorators/tenant-context";
import { AcceptLegalDocumentsInteractor, type AcceptLegalDocumentsData } from "../accept-legal-documents.interactor";
import type { LegalAuditRecord, LegalAuditRepo } from "../legal-audit.repo";

const user = mockUser;

function noticeRecord(overrides: Partial<LegalNoticeAuditPayload> = {}): LegalAuditRecord {
  const payload: LegalNoticeAuditPayload = {
    versions: currentLegalDocumentVersions(),
    changedDocuments: ["terms", "dpa"],
    recipientEmail: user.email,
    locale: "en",
    effectiveAt: "2026-08-21T00:00:00.000Z",
    ...overrides,
  };
  return {
    createdAt: new Date("2026-08-07T00:00:00.000Z"),
    entityId: user.id,
    event: DomainEvent.LEGAL_NOTICE_SENT,
    payload,
    userId: user.id,
  };
}

function acceptanceRecord(overrides: Partial<LegalAcceptanceAuditPayload> = {}): LegalAuditRecord {
  const payload: LegalAcceptanceAuditPayload = {
    versions: currentLegalDocumentVersions(),
    acceptingEmail: user.email,
    locale: "en",
    acceptanceType: "later-update",
    ...overrides,
  };
  return {
    createdAt: new Date("2026-08-08T00:00:00.000Z"),
    entityId: user.companyId,
    event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
    payload,
    userId: user.id,
  };
}

describe("AcceptLegalDocumentsInteractor", () => {
  let records: LegalAuditRecord[];
  let findLegalEventsUnscoped: ReturnType<typeof vi.fn>;
  let auditRepo: LegalAuditRepo;
  let eventService: { publish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    runInTransaction.mockImplementation((fn: () => Promise<unknown>) => {
      expect(getTenantUser().id).toBe(mockUser.id);
      return fn();
    });
    mockEnv.APP_MODE = "cloud";
    mockLocale.value = "de";
    mockUser = user;
    records = [noticeRecord()];
    findLegalEventsUnscoped = vi.fn(() => Promise.resolve(records));
    auditRepo = { findLegalEventsUnscoped } as unknown as LegalAuditRepo;
    eventService = { publish: vi.fn().mockResolvedValue(undefined) };
  });

  function interactor() {
    return new AcceptLegalDocumentsInteractor(auditRepo, eventService as never);
  }

  it("records a minimal company-wide acceptance from an authorised administrator", async () => {
    await expect(interactor().invoke({ agreeToLegalDocuments: true })).resolves.toEqual({
      ok: true,
      data: { agreeToLegalDocuments: true },
    });

    expect(runInTransaction).toHaveBeenCalledWith(expect.any(Function), undefined);
    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, {
      entityId: user.companyId,
      payload: {
        acceptanceType: "later-update",
        acceptingEmail: user.email,
        locale: "de",
        versions: currentLegalDocumentVersions(),
      },
    });
  });

  it("is idempotent when a current company acceptance already exists", async () => {
    records.push(acceptanceRecord());

    await interactor().invoke({ agreeToLegalDocuments: true });

    expect(findLegalEventsUnscoped).toHaveBeenCalledOnce();
    expect(findLegalEventsUnscoped).toHaveBeenCalledWith(user.companyId);
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("does not deduplicate an acceptance with an old Terms version", async () => {
    records.push(
      acceptanceRecord({
        versions: { ...currentLegalDocumentVersions(), terms: "2026-08-06" },
      }),
    );

    await interactor().invoke({ agreeToLegalDocuments: true });

    expect(eventService.publish).toHaveBeenCalledWith(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, expect.anything());
  });

  it("requires a current notice that actually includes Terms or DPA", async () => {
    records = [noticeRecord({ changedDocuments: ["privacy", "subprocessors"] })];
    await expect(interactor().invoke({ agreeToLegalDocuments: true })).rejects.toThrow(
      "The current legal update has not been delivered to the company",
    );

    records = [noticeRecord({ effectiveAt: null })];
    await expect(interactor().invoke({ agreeToLegalDocuments: true })).rejects.toThrow(
      "The current legal update has not been delivered to the company",
    );

    records = [
      noticeRecord({
        versions: { ...currentLegalDocumentVersions(), dpa: "2026-08-06" },
      }),
    ];
    await expect(interactor().invoke({ agreeToLegalDocuments: true })).rejects.toThrow(
      "The current legal update has not been delivered to the company",
    );
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("rejects non-administrators and self-hosted installations", async () => {
    if (!user.role) throw new Error("Expected the fixture user to have a role");
    mockUser = createMockUser({ role: { ...user.role, isSystemRole: false } });
    await expect(interactor().invoke({ agreeToLegalDocuments: true })).rejects.toBeInstanceOf(ForbiddenError);

    mockUser = user;
    mockEnv.APP_MODE = "self-hosted";
    await expect(interactor().invoke({ agreeToLegalDocuments: true })).rejects.toBeInstanceOf(ForbiddenError);
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("requires the explicit acceptance checkbox", async () => {
    const result = await interactor().invoke({
      agreeToLegalDocuments: false,
    } as unknown as AcceptLegalDocumentsData);

    expect(result.ok).toBe(false);
    expect(findLegalEventsUnscoped).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });
});
