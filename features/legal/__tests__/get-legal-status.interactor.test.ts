import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockDiModule } from "@/tests/helpers/interactor-test-setup";
import { createMockUser } from "@/tests/helpers/mock-user";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
}));
vi.mock("@/env", () => ({ env: mockEnv }));

let mockUser = createMockUser({ id: "user-1", companyId: "company-1" });
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));

import { currentLegalDocumentVersions } from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";
import { GetLegalStatusInteractor } from "../get-legal-status.interactor";
import type { LegalAcceptanceAuditPayload, LegalAuditRecord, LegalNoticeAuditPayload } from "../legal-audit.schema";
import type { LegalAuditRepo } from "../legal-audit.repo";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const DEADLINE = "2026-08-21T00:00:00.000Z";

function noticePayload(overrides: Partial<LegalNoticeAuditPayload> = {}): LegalNoticeAuditPayload {
  return {
    versions: currentLegalDocumentVersions(),
    changedDocuments: ["terms", "dpa"],
    recipientEmail: "admin@example.com",
    effectiveAt: DEADLINE,
    ...overrides,
  };
}

function acceptancePayload(overrides: Partial<LegalAcceptanceAuditPayload> = {}): LegalAcceptanceAuditPayload {
  return {
    versions: currentLegalDocumentVersions(),
    acceptingEmail: "admin@example.com",
    acceptanceType: "later-update",
    ...overrides,
  };
}

function record(
  event: DomainEvent.LEGAL_NOTICE_SENT | DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
  payload: LegalNoticeAuditPayload | LegalAcceptanceAuditPayload,
  options: { entityId?: string; userId?: string; createdAt?: Date } = {},
): LegalAuditRecord {
  const entityId = options.entityId ?? (event === DomainEvent.LEGAL_NOTICE_SENT ? "user-1" : "company-1");
  const userId = options.userId ?? "user-1";
  const base = { createdAt: options.createdAt ?? NOW, entityId, userId };

  return event === DomainEvent.LEGAL_NOTICE_SENT
    ? { ...base, event, payload: payload as LegalNoticeAuditPayload }
    : { ...base, event, payload: payload as LegalAcceptanceAuditPayload };
}

describe("GetLegalStatusInteractor", () => {
  let records: LegalAuditRecord[];
  let findLegalEventsUnscoped: ReturnType<typeof vi.fn>;
  let repo: LegalAuditRepo;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockEnv.APP_MODE = "cloud";
    mockUser = createMockUser({ id: "user-1", companyId: "company-1" });
    records = [];
    findLegalEventsUnscoped = vi.fn(() => Promise.resolve(records));
    repo = { findLegalEventsUnscoped } as unknown as LegalAuditRepo;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts the banner and server-side deadline only after a current contract notice exists", async () => {
    const interactor = new GetLegalStatusInteractor(repo);

    expect(await interactor.invoke()).toEqual({
      contractAccepted: false,
      contractNoticeSent: false,
      effectiveAt: null,
      isSystemAdministrator: true,
      mustAccept: false,
    });
    expect(findLegalEventsUnscoped).toHaveBeenLastCalledWith(mockUser.companyId);

    records.push(
      record(
        DomainEvent.LEGAL_NOTICE_SENT,
        noticePayload({
          versions: { ...currentLegalDocumentVersions(), terms: "2026-08-06" },
        }),
      ),
    );
    expect(await interactor.invoke()).toMatchObject({
      contractNoticeSent: false,
      mustAccept: false,
    });

    records.push(record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload({ effectiveAt: null })));
    expect(await interactor.invoke()).toMatchObject({
      contractNoticeSent: false,
      effectiveAt: null,
      mustAccept: false,
    });

    records.push(record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload()));
    expect(await interactor.invoke()).toMatchObject({
      contractNoticeSent: true,
      contractAccepted: false,
      effectiveAt: DEADLINE,
      mustAccept: false,
    });

    vi.setSystemTime(new Date(DEADLINE));
    expect(await interactor.invoke()).toMatchObject({ mustAccept: true });
  });

  it("uses the earliest current contract notice as the company deadline", async () => {
    records.push(
      record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload(), {
        userId: "admin-1",
        entityId: "admin-1",
        createdAt: new Date("2026-08-07T08:00:00.000Z"),
      }),
      record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload({ effectiveAt: "2026-08-22T00:00:00.000Z" }), {
        userId: "admin-2",
        entityId: "admin-2",
        createdAt: new Date("2026-08-08T08:00:00.000Z"),
      }),
    );

    mockUser = createMockUser({ id: "admin-2", companyId: "company-1" });
    const status = await new GetLegalStatusInteractor(repo).invoke();
    expect(status.effectiveAt).toBe(DEADLINE);
  });

  it("uses the earliest valid current deadline when an earlier audit payload is malformed", async () => {
    records.push(
      record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload({ effectiveAt: "not-a-date" }), {
        userId: "admin-1",
        entityId: "admin-1",
        createdAt: new Date("2026-08-07T07:00:00.000Z"),
      }),
      record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload(), {
        userId: "admin-2",
        entityId: "admin-2",
        createdAt: new Date("2026-08-07T08:00:00.000Z"),
      }),
    );

    mockUser = createMockUser({ id: "admin-2", companyId: "company-1" });
    await expect(new GetLegalStatusInteractor(repo).invoke()).resolves.toMatchObject({
      contractNoticeSent: true,
      effectiveAt: DEADLINE,
      mustAccept: false,
    });
  });

  it("restores company-wide access after any administrator accepts the current Terms and DPA", async () => {
    records.push(
      record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload()),
      record(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, acceptancePayload(), {
        userId: "admin-2",
      }),
    );
    vi.setSystemTime(new Date("2026-08-22T00:00:00.000Z"));

    const role = createMockUser().role;
    if (!role) throw new Error("Expected the fixture user to have a role");
    mockUser = createMockUser({
      id: "member-1",
      companyId: "company-1",
      role: { ...role, isSystemRole: false },
    });

    expect(await new GetLegalStatusInteractor(repo).invoke()).toEqual({
      contractAccepted: true,
      contractNoticeSent: true,
      effectiveAt: null,
      isSystemAdministrator: false,
      mustAccept: false,
    });
  });

  it("never treats Privacy or Subprocessor-only notices as contract acceptance gates", async () => {
    records.push(
      record(
        DomainEvent.LEGAL_NOTICE_SENT,
        noticePayload({
          changedDocuments: ["privacy", "subprocessors"],
          effectiveAt: DEADLINE,
        }),
      ),
    );

    expect(await new GetLegalStatusInteractor(repo).invoke()).toMatchObject({
      contractNoticeSent: false,
      effectiveAt: null,
      mustAccept: false,
    });
  });

  it.each(["self-hosted", "demo"] as const)(
    "does not query or enforce managed-service documents in %s mode",
    async (appMode) => {
      mockEnv.APP_MODE = appMode;

      expect(await new GetLegalStatusInteractor(repo).invoke()).toMatchObject({
        contractNoticeSent: false,
        mustAccept: false,
      });
      expect(findLegalEventsUnscoped).not.toHaveBeenCalled();
    },
  );
});
