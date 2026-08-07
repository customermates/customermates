import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
}));
vi.mock("@/env", () => ({ env: mockEnv }));

import { DomainEvent } from "@/features/event/domain-events";
import {
  currentLegalDocumentVersions,
  type LegalAcceptanceAuditPayload,
  type LegalNoticeAuditPayload,
} from "@/constants/legal-documents";
import { GetLegalStatusInteractor, type LegalAuditRecord, type LegalAuditRepo } from "../get-legal-status.interactor";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const DEADLINE = "2026-08-21T00:00:00.000Z";

function noticePayload(overrides: Partial<LegalNoticeAuditPayload> = {}): LegalNoticeAuditPayload {
  return {
    versions: currentLegalDocumentVersions(),
    changedDocuments: ["terms", "dpa"],
    recipientEmail: "admin@example.com",
    locale: "en",
    effectiveAt: DEADLINE,
    ...overrides,
  };
}

function acceptancePayload(
  acceptanceType: "initial-onboarding" | "later-update",
  overrides: Partial<LegalAcceptanceAuditPayload> = {},
): LegalAcceptanceAuditPayload {
  return {
    versions: currentLegalDocumentVersions(),
    acceptingEmail: "admin@example.com",
    locale: "en",
    acceptanceType,
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
  return {
    createdAt: options.createdAt ?? NOW,
    entityId,
    event,
    eventData: { event, payload, userId, companyId: "company-1", entityId },
    userId,
  };
}

function nonSystemRole() {
  const role = createMockUser().role;
  if (!role) throw new Error("Expected the fixture user to have a role");
  return { ...role, isSystemRole: false };
}

describe("GetLegalStatusInteractor", () => {
  let records: LegalAuditRecord[];
  let findLegalEventsUnscoped: ReturnType<typeof vi.fn>;
  let repo: LegalAuditRepo;

  beforeEach(() => {
    mockEnv.APP_MODE = "cloud";
    records = [];
    findLegalEventsUnscoped = vi.fn(() => Promise.resolve(records));
    repo = { findLegalEventsUnscoped } as unknown as LegalAuditRepo;
  });

  it("starts the banner and server-side deadline only after a current contract notice exists", async () => {
    const user = createMockUser({ id: "user-1", companyId: "company-1" });
    const interactor = new GetLegalStatusInteractor(repo);

    expect(await interactor.invoke(user, NOW)).toEqual({
      contractAccepted: false,
      contractNoticeSent: false,
      effectiveAt: null,
      informationNoticeVisible: false,
      isSystemAdministrator: true,
      mustAccept: false,
    });

    records.push(
      record(
        DomainEvent.LEGAL_NOTICE_SENT,
        noticePayload({ versions: { ...currentLegalDocumentVersions(), terms: "2026-08-06" } }),
      ),
    );
    expect(await interactor.invoke(user, NOW)).toMatchObject({ contractNoticeSent: false, mustAccept: false });

    records.push(record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload()));
    expect(await interactor.invoke(user, NOW)).toMatchObject({
      contractNoticeSent: true,
      contractAccepted: false,
      effectiveAt: DEADLINE,
      mustAccept: false,
    });
    expect(await interactor.invoke(user, new Date(DEADLINE))).toMatchObject({ mustAccept: true });
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

    const status = await new GetLegalStatusInteractor(repo).invoke(
      createMockUser({ id: "admin-2", companyId: "company-1" }),
      NOW,
    );
    expect(status.effectiveAt).toBe(DEADLINE);
  });

  it("restores company-wide access after any administrator accepts the current Terms and DPA", async () => {
    records.push(record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload()));
    records.push(
      record(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, acceptancePayload("later-update"), {
        userId: "admin-2",
      }),
    );

    const member = createMockUser({
      id: "member-1",
      companyId: "company-1",
      role: nonSystemRole(),
    });
    expect(await new GetLegalStatusInteractor(repo).invoke(member, new Date("2026-08-22T00:00:00.000Z"))).toEqual({
      contractAccepted: true,
      contractNoticeSent: true,
      effectiveAt: null,
      informationNoticeVisible: false,
      isSystemAdministrator: false,
      mustAccept: false,
    });
  });

  it("shows a recipient's informational notice for 14 days from its audit timestamp without blocking", async () => {
    records.push(
      record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload({ changedDocuments: ["privacy"], effectiveAt: null }), {
        createdAt: new Date("2026-08-07T00:00:00.000Z"),
      }),
    );
    const member = createMockUser({ id: "user-1", companyId: "company-1", role: nonSystemRole() });
    const interactor = new GetLegalStatusInteractor(repo);

    expect(await interactor.invoke(member, NOW)).toMatchObject({
      effectiveAt: null,
      informationNoticeVisible: true,
      mustAccept: false,
    });
    expect(await interactor.invoke(member, new Date("2026-08-21T00:00:00.000Z"))).toMatchObject({
      informationNoticeVisible: false,
      mustAccept: false,
    });
  });

  it("uses only the accepting user's initial onboarding as an informational acknowledgement", async () => {
    records.push(record(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, acceptancePayload("initial-onboarding")));
    records.push(
      record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload({ changedDocuments: ["privacy"], effectiveAt: null })),
    );

    const creator = createMockUser({ id: "user-1", companyId: "company-1", role: nonSystemRole() });
    expect(await new GetLegalStatusInteractor(repo).invoke(creator, NOW)).toMatchObject({
      informationNoticeVisible: false,
    });

    records.push(
      record(DomainEvent.LEGAL_NOTICE_SENT, noticePayload({ changedDocuments: ["privacy"], effectiveAt: null }), {
        entityId: "admin-2",
        userId: "admin-2",
      }),
    );
    const laterAdministrator = createMockUser({ id: "admin-2", companyId: "company-1" });
    expect(await new GetLegalStatusInteractor(repo).invoke(laterAdministrator, NOW)).toMatchObject({
      informationNoticeVisible: true,
    });
  });

  it("keeps another administrator's information banner after company-wide contract acceptance", async () => {
    records.push(
      record(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, acceptancePayload("later-update"), { userId: "admin-2" }),
      record(
        DomainEvent.LEGAL_NOTICE_SENT,
        noticePayload({ changedDocuments: ["privacy", "subprocessors"], effectiveAt: DEADLINE }),
        { entityId: "admin-1", userId: "admin-1" },
      ),
    );

    expect(
      await new GetLegalStatusInteractor(repo).invoke(createMockUser({ id: "admin-1", companyId: "company-1" }), NOW),
    ).toMatchObject({
      contractAccepted: true,
      effectiveAt: null,
      informationNoticeVisible: true,
      mustAccept: false,
    });
  });

  it("never treats Privacy or Subprocessor-only notices as contract acceptance gates", async () => {
    records.push(
      record(
        DomainEvent.LEGAL_NOTICE_SENT,
        noticePayload({ changedDocuments: ["privacy", "subprocessors"], effectiveAt: DEADLINE }),
      ),
    );

    expect(
      await new GetLegalStatusInteractor(repo).invoke(
        createMockUser({ id: "user-1", companyId: "company-1" }),
        new Date("2026-08-08T00:00:00.000Z"),
      ),
    ).toMatchObject({
      contractNoticeSent: false,
      effectiveAt: null,
      informationNoticeVisible: true,
      mustAccept: false,
    });
  });

  it("does not query or enforce managed-service documents outside cloud mode", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const status = await new GetLegalStatusInteractor(repo).invoke(createMockUser(), NOW);

    expect(status.mustAccept).toBe(false);
    expect(findLegalEventsUnscoped).not.toHaveBeenCalled();
  });
});
