import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "demo" | "self-hosted",
}));
vi.mock("@/env", () => ({ env: mockEnv }));

import { DomainEvent } from "@/features/event/domain-events";
import {
  LEGAL_CONTRACT_KEY,
  LEGAL_INFORMATION_KEY,
  currentLegalDocumentVersions,
  type LegalAcceptanceAuditPayload,
  type LegalNoticeAuditPayload,
} from "@/constants/legal-documents";
import { LegalStatusService, type LegalAuditRecord, type LegalAuditRepo } from "../legal-status.service";

const NOW = new Date("2026-08-07T12:00:00.000Z");
const DEADLINE = "2026-08-21T00:00:00.000Z";

function noticePayload(overrides: Partial<LegalNoticeAuditPayload> = {}): LegalNoticeAuditPayload {
  return {
    versions: currentLegalDocumentVersions(),
    contractKey: LEGAL_CONTRACT_KEY,
    informationKey: LEGAL_INFORMATION_KEY,
    changedDocuments: ["terms", "dpa"],
    recipient: { id: "user-1", email: "admin@example.com" },
    locale: "en",
    noticeAt: "2026-08-07T00:00:00.000Z",
    effectiveAt: DEADLINE,
    providerMessageId: "msg-1",
    deployedGitCommit: "a".repeat(40),
    acceptanceType: null,
    ...overrides,
  };
}

function acceptancePayload(acceptanceType: "initial-onboarding" | "later-update"): LegalAcceptanceAuditPayload {
  return {
    versions: currentLegalDocumentVersions(),
    contractKey: LEGAL_CONTRACT_KEY,
    informationKey: LEGAL_INFORMATION_KEY,
    changedDocuments: ["terms", "dpa", "privacy", "subprocessors"],
    acceptingUser: { id: "user-1", email: "admin@example.com" },
    locale: "en",
    noticeAt: null,
    effectiveAt: NOW.toISOString(),
    providerMessageId: null,
    deployedGitCommit: "a".repeat(40),
    acceptanceType,
  };
}

function record(event: DomainEvent, payload: LegalNoticeAuditPayload | LegalAcceptanceAuditPayload): LegalAuditRecord {
  return {
    createdAt: NOW,
    entityId: event === DomainEvent.LEGAL_INFORMATION_NOTICE_SENT ? LEGAL_INFORMATION_KEY : LEGAL_CONTRACT_KEY,
    eventData: { event, payload, userId: "user-1", companyId: "company-1" },
    userId: "user-1",
  };
}

function nonSystemRole() {
  const role = createMockUser().role;
  if (!role) throw new Error("Expected the fixture user to have a role");
  return { ...role, isSystemRole: false };
}

describe("LegalStatusService", () => {
  let records: LegalAuditRecord[];
  let repo: LegalAuditRepo;
  let findLegalEventUnscoped: Mock<LegalAuditRepo["findLegalEventUnscoped"]>;

  beforeEach(() => {
    mockEnv.APP_MODE = "cloud";
    records = [];
    findLegalEventUnscoped = vi.fn<LegalAuditRepo["findLegalEventUnscoped"]>((args) => {
      const matches = records.filter((candidate) => {
        const data = candidate.eventData as {
          event: DomainEvent;
          companyId: string;
        };
        return (
          data.companyId === args.companyId &&
          data.event === args.event &&
          (args.entityId === undefined || candidate.entityId === args.entityId) &&
          (args.userId === undefined || candidate.userId === args.userId)
        );
      });
      matches.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return Promise.resolve((args.order === "asc" ? matches[0] : matches.at(-1)) ?? null);
    });
    repo = {
      findLegalEventUnscoped,
    };
  });

  it("starts the banner and deadline only after a successful contract notice record exists", async () => {
    const user = createMockUser({ id: "user-1", companyId: "company-1" });
    const service = new LegalStatusService(repo);

    expect(await service.getStatus(user, NOW)).toMatchObject({
      contractNoticeSent: false,
      mustAccept: false,
    });

    records.push(record(DomainEvent.LEGAL_CONTRACT_NOTICE_SENT, noticePayload()));
    expect(await service.getStatus(user, NOW)).toMatchObject({
      contractNoticeSent: true,
      contractAccepted: false,
      effectiveAt: DEADLINE,
      mustAccept: false,
    });
    expect(await service.getStatus(user, new Date("2026-08-21T00:00:00.000Z"))).toMatchObject({ mustAccept: true });
  });

  it("restores company-wide access after any administrator records the current contract acceptance", async () => {
    records.push(record(DomainEvent.LEGAL_CONTRACT_NOTICE_SENT, noticePayload()));
    records.push(record(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, acceptancePayload("later-update")));

    const member = createMockUser({
      id: "member-1",
      companyId: "company-1",
      role: nonSystemRole(),
    });
    const status = await new LegalStatusService(repo).getStatus(member, new Date("2026-08-22T00:00:00.000Z"));

    expect(status).toMatchObject({ contractAccepted: true, mustAccept: false });
  });

  it("shows successful information notices temporarily and never blocks access", async () => {
    records.push(
      record(
        DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
        noticePayload({ changedDocuments: ["privacy"], effectiveAt: null }),
      ),
    );
    const member = createMockUser({
      id: "user-1",
      companyId: "company-1",
      role: nonSystemRole(),
    });
    const service = new LegalStatusService(repo);

    expect(await service.getStatus(member, NOW)).toMatchObject({
      informationNoticeVisible: true,
      mustAccept: false,
    });
    expect(await service.getStatus(member, new Date("2026-08-21T00:00:00.000Z"))).toMatchObject({
      informationNoticeVisible: false,
      mustAccept: false,
    });
  });

  it("uses initial onboarding as the information baseline but not a later administrator acceptance for members", async () => {
    records.push(record(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, acceptancePayload("initial-onboarding")));
    records.push(
      record(
        DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
        noticePayload({ changedDocuments: ["privacy"], effectiveAt: null }),
      ),
    );
    const member = createMockUser({
      id: "user-1",
      companyId: "company-1",
      role: nonSystemRole(),
    });

    expect(await new LegalStatusService(repo).getStatus(member, NOW)).toMatchObject({
      informationNoticeVisible: false,
    });

    records = records.filter((candidate) => {
      const data = candidate.eventData as { event: DomainEvent };
      return data.event !== DomainEvent.LEGAL_DOCUMENTS_ACCEPTED;
    });
    records.push(record(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, acceptancePayload("later-update")));

    expect(await new LegalStatusService(repo).getStatus(member, NOW)).toMatchObject({
      informationNoticeVisible: true,
    });
  });

  it("shows an information-only update to an administrator whose prior acceptance has an old information key", async () => {
    records.push(
      record(DomainEvent.LEGAL_DOCUMENTS_ACCEPTED, {
        ...acceptancePayload("later-update"),
        informationKey: "privacy:2026-08-01|subprocessors:2026-08-01",
      }),
    );
    records.push(
      record(
        DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
        noticePayload({
          changedDocuments: ["privacy", "subprocessors"],
          effectiveAt: DEADLINE,
        }),
      ),
    );

    expect(
      await new LegalStatusService(repo).getStatus(createMockUser({ id: "user-1", companyId: "company-1" }), NOW),
    ).toMatchObject({
      contractAccepted: true,
      informationNoticeVisible: true,
      mustAccept: false,
    });
  });

  it("does not query or enforce managed-service documents outside cloud mode", async () => {
    mockEnv.APP_MODE = "self-hosted";
    const status = await new LegalStatusService(repo).getStatus(createMockUser(), NOW);

    expect(status.mustAccept).toBe(false);
    expect(findLegalEventUnscoped).not.toHaveBeenCalled();
  });
});
