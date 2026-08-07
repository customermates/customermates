import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "self-hosted",
  BASE_URL: "https://customermates.com",
  NODE_ENV: "test" as "test" | "production",
  RESEND_OPERATOR_EMAIL: "mail@customermates.com",
  VERCEL_GIT_COMMIT_SHA: "a".repeat(40),
}));
const mockLegalDocumentNotice = vi.hoisted(() =>
  vi.fn((props: unknown) => ({
    key: null,
    props,
    type: "legal-document-notice",
  })),
);

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/components/emails/legal-document-notice", () => ({
  default: mockLegalDocumentNotice,
}));
vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));
vi.mock("@/core/decorators/transaction-runner", () => ({
  runInTransaction: (fn: () => Promise<unknown>) => fn(),
}));

import { DomainEvent } from "@/features/event/domain-events";
import {
  LEGAL_CONTRACT_KEY,
  LEGAL_INFORMATION_KEY,
  currentLegalDocumentVersions,
  type LegalAcceptanceAuditPayload,
  type LegalNoticeAuditPayload,
} from "@/constants/legal-documents";
import type { LegalAuditRecord } from "@/features/legal/get-legal-status.interactor";
import {
  SendLegalDocumentNoticesInteractor,
  type LegalNoticeRecipient,
} from "../send-legal-document-notices.interactor";

const NOW = new Date("2026-08-07T09:00:00.000Z");

function recipient(
  id: string,
  isSystemAdministrator: boolean,
  displayLanguage: LegalNoticeRecipient["displayLanguage"] = "en",
): LegalNoticeRecipient {
  return {
    id,
    companyId: "company-1",
    email: `${id}@example.com`,
    firstName: id,
    displayLanguage,
    isSystemAdministrator,
  };
}

function initialAcceptance(overrides: Partial<LegalAcceptanceAuditPayload> = {}): LegalAuditRecord {
  const payload: LegalAcceptanceAuditPayload = {
    versions: currentLegalDocumentVersions(),
    contractKey: LEGAL_CONTRACT_KEY,
    informationKey: LEGAL_INFORMATION_KEY,
    changedDocuments: ["terms", "dpa", "privacy", "subprocessors"],
    acceptingUser: { id: "admin-1", email: "admin-1@example.com" },
    locale: "en",
    noticeAt: null,
    effectiveAt: NOW.toISOString(),
    providerMessageId: null,
    deployedGitCommit: "a".repeat(40),
    acceptanceType: "initial-onboarding",
    ...overrides,
  };
  return {
    createdAt: NOW,
    entityId: LEGAL_CONTRACT_KEY,
    eventData: {
      event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
      companyId: "company-1",
      payload,
    },
    userId: "admin-1",
  };
}

describe("SendLegalDocumentNoticesInteractor", () => {
  let records: LegalAuditRecord[];
  let recipientRepo: {
    findActiveLegalNoticeRecipientsUnscoped: ReturnType<typeof vi.fn>;
  };
  let auditRepo: {
    findLegalEventUnscoped: ReturnType<typeof vi.fn>;
    findLegalEventsUnscoped: ReturnType<typeof vi.fn>;
  };
  let emailService: { send: ReturnType<typeof vi.fn> };
  let eventService: { publish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockEnv.APP_MODE = "cloud";
    mockEnv.NODE_ENV = "test";
    mockEnv.VERCEL_GIT_COMMIT_SHA = "a".repeat(40);
    records = [];
    recipientRepo = {
      findActiveLegalNoticeRecipientsUnscoped: vi
        .fn()
        .mockResolvedValue([recipient("admin-1", true), recipient("admin-2", true), recipient("member-1", false)]),
    };
    auditRepo = {
      findLegalEventUnscoped: vi.fn((args) => {
        const matches = records.filter((candidate) => {
          const data = candidate.eventData as {
            event: string;
            companyId: string;
          };
          return (
            data.event === args.event &&
            data.companyId === args.companyId &&
            (args.entityId === undefined || candidate.entityId === args.entityId) &&
            (args.excludeEntityId === undefined || candidate.entityId !== args.excludeEntityId) &&
            (args.userId === undefined || candidate.userId === args.userId)
          );
        });
        matches.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        return Promise.resolve((args.order === "asc" ? matches[0] : matches.at(-1)) ?? null);
      }),
      findLegalEventsUnscoped: vi.fn((args) =>
        Promise.resolve(
          records.filter((candidate) => {
            const data = candidate.eventData as {
              event: string;
              companyId: string;
            };
            return (
              data.event === args.event &&
              data.companyId === args.companyId &&
              candidate.entityId === args.entityId &&
              (args.userId === undefined || candidate.userId === args.userId)
            );
          }),
        ),
      ),
    };
    let message = 0;
    emailService = { send: vi.fn(() => Promise.resolve({ id: `msg-${++message}` })) };
    eventService = {
      publish: vi.fn((event, data, options) => {
        records.push({
          createdAt: NOW,
          entityId: data.entityId,
          eventData: {
            event,
            companyId: options.systemCompanyId,
            payload: data.payload,
          },
          userId: options.systemUserId,
        });
        return Promise.resolve();
      }),
    };
  });

  function interactor() {
    return new SendLegalDocumentNoticesInteractor(
      recipientRepo as never,
      auditRepo as never,
      emailService as never,
      eventService as never,
    );
  }

  it("sends one combined administrator email, a Privacy-only member email, then records success", async () => {
    await interactor().invoke(NOW);

    expect(emailService.send).toHaveBeenCalledTimes(3);
    expect(emailService.send.mock.calls[0][0].react.props.documents.map((item: { name: string }) => item.name)).toEqual(
      ["Terms and Conditions", "Data Processing Agreement", "Privacy Policy", "Subprocessors"],
    );
    expect(emailService.send.mock.calls[2][0].react.props.documents.map((item: { name: string }) => item.name)).toEqual(
      ["Privacy Policy"],
    );
    expect(emailService.send.mock.calls[0][0].idempotencyKey).toContain("admin-1");
    expect(emailService.send.mock.calls[0][0].react.props.objections).toHaveLength(2);
    expect(emailService.send.mock.calls[0][0].react.props.objections.join(" ")).toContain("listed subprocessor change");

    const adminEvents = eventService.publish.mock.calls.filter((call) => call[2].systemUserId === "admin-1");
    expect(adminEvents.map((call) => call[0])).toEqual([
      DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
      DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
    ]);
    expect(adminEvents[0][1].payload.providerMessageId).toBe("msg-1");
    expect(adminEvents[1][1].payload.providerMessageId).toBe("msg-1");

    const deadlines = eventService.publish.mock.calls
      .filter((call) => call[0] === DomainEvent.LEGAL_CONTRACT_NOTICE_SENT)
      .map((call) => call[1].payload.effectiveAt);
    expect(new Set(deadlines)).toEqual(new Set(["2026-08-21T09:00:00.000Z"]));

    emailService.send.mockClear();
    eventService.publish.mockClear();
    await interactor().invoke(new Date("2026-08-08T09:00:00.000Z"));
    expect(emailService.send).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("continues after one provider failure, records no false success, and retries only the missing recipient", async () => {
    emailService.send.mockRejectedValueOnce(new Error("provider failed"));

    await expect(interactor().invoke(NOW)).rejects.toThrow("provider failed");
    expect(emailService.send).toHaveBeenCalledTimes(3);
    expect(eventService.publish).toHaveBeenCalledTimes(3);
    expect(eventService.publish.mock.calls.some((call) => call[2].systemUserId === "admin-1")).toBe(false);
    expect(eventService.publish.mock.calls.some((call) => call[2].systemUserId === "admin-2")).toBe(true);
    expect(eventService.publish.mock.calls.some((call) => call[2].systemUserId === "member-1")).toBe(true);

    await interactor().invoke(new Date("2026-08-08T09:00:00.000Z"));
    expect(emailService.send).toHaveBeenCalledTimes(4);
    expect(emailService.send.mock.calls[3][0].to).toBe("admin-1@example.com");
    expect(emailService.send.mock.calls[3][0].idempotencyKey).toBe(emailService.send.mock.calls[0][0].idempotencyKey);
    expect(eventService.publish).toHaveBeenCalledTimes(5);
  });

  it("fails closed in production when immutable deployment evidence is unavailable", async () => {
    mockEnv.NODE_ENV = "production";
    mockEnv.VERCEL_GIT_COMMIT_SHA = "not-a-commit";

    await expect(interactor().invoke(NOW)).rejects.toThrow("immutable legal-version evidence");
    expect(emailService.send).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("uses current initial onboarding acceptance as the baseline and sends nothing", async () => {
    records.push(initialAcceptance());
    await interactor().invoke(NOW);

    expect(emailService.send).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it.each([
    {
      locale: "en" as const,
      document: "Subprocessors",
      deadlineLabel: "Subprocessor objection deadline",
      objection: "No acceptance is required.",
    },
    {
      locale: "de" as const,
      document: "Unterauftragsverarbeiter",
      deadlineLabel: "Widerspruchsfrist für Unterauftragsverarbeiter",
      objection: "Eine Annahme ist nicht erforderlich.",
    },
  ])(
    "sends a $locale subprocessor-only objection notice to administrators but not ordinary members",
    async ({ locale, document, deadlineLabel, objection }) => {
      records.push(
        initialAcceptance({
          versions: {
            ...currentLegalDocumentVersions(),
            subprocessors: "2026-08-01",
          },
          informationKey: "privacy:2026-08-07|subprocessors:2026-08-01",
        }),
      );
      recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([
        recipient("admin-1", true, locale),
        recipient("member-1", false, locale),
      ]);

      await interactor().invoke(NOW);

      expect(emailService.send).toHaveBeenCalledTimes(1);
      expect(emailService.send.mock.calls[0][0].to).toBe("admin-1@example.com");
      const props = emailService.send.mock.calls[0][0].react.props;
      expect(props.documents.map((item: { name: string }) => item.name)).toEqual([document]);
      expect(props.deadlineLabel).toBe(deadlineLabel);
      expect(props.objections.join(" ")).toContain(objection);
      expect(eventService.publish).toHaveBeenCalledWith(
        DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
        expect.anything(),
        expect.objectContaining({ systemUserId: "admin-1" }),
      );
    },
  );

  it("reuses the first administrator deadline for later subprocessor-notice retries", async () => {
    records.push(
      initialAcceptance({
        versions: {
          ...currentLegalDocumentVersions(),
          subprocessors: "2026-08-01",
        },
        informationKey: "privacy:2026-08-07|subprocessors:2026-08-01",
      }),
    );
    const oldContractNotice: LegalNoticeAuditPayload = {
      versions: {
        ...currentLegalDocumentVersions(),
        privacy: "2026-08-01",
        subprocessors: "2026-08-01",
      },
      contractKey: LEGAL_CONTRACT_KEY,
      informationKey: "privacy:2026-08-01|subprocessors:2026-08-01",
      changedDocuments: ["terms", "dpa"],
      recipient: { id: "admin-1", email: "admin-1@example.com" },
      locale: "en",
      noticeAt: "2026-07-20T09:00:00.000Z",
      effectiveAt: "2026-08-03T09:00:00.000Z",
      providerMessageId: "old-message",
      deployedGitCommit: "b".repeat(40),
      acceptanceType: null,
    };
    records.push({
      createdAt: new Date(oldContractNotice.noticeAt),
      entityId: LEGAL_CONTRACT_KEY,
      eventData: {
        event: DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
        companyId: "company-1",
        payload: oldContractNotice,
      },
      userId: "admin-1",
    });
    recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([recipient("admin-1", true)]);

    await interactor().invoke(NOW);
    expect(eventService.publish.mock.calls[0][1].payload.effectiveAt).toBe("2026-08-21T09:00:00.000Z");

    recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([
      recipient("admin-1", true),
      recipient("admin-2", true),
    ]);
    eventService.publish.mockClear();
    await interactor().invoke(new Date("2026-08-10T09:00:00.000Z"));

    expect(emailService.send).toHaveBeenCalledTimes(2);
    expect(emailService.send.mock.calls[1][0].to).toBe("admin-2@example.com");
    expect(eventService.publish.mock.calls[0][1].payload.effectiveAt).toBe("2026-08-21T09:00:00.000Z");
  });

  it("keeps separate contract and information deadlines when the document families changed in different releases", async () => {
    const priorContractNotice: LegalNoticeAuditPayload = {
      versions: {
        ...currentLegalDocumentVersions(),
        privacy: "2026-08-01",
        subprocessors: "2026-08-01",
      },
      contractKey: LEGAL_CONTRACT_KEY,
      informationKey: "privacy:2026-08-01|subprocessors:2026-08-01",
      changedDocuments: ["terms", "dpa"],
      recipient: { id: "admin-1", email: "admin-1@example.com" },
      locale: "en",
      noticeAt: "2026-07-20T09:00:00.000Z",
      effectiveAt: "2026-08-03T09:00:00.000Z",
      providerMessageId: "prior-contract-message",
      deployedGitCommit: "b".repeat(40),
      acceptanceType: null,
    };
    records.push({
      createdAt: new Date(priorContractNotice.noticeAt),
      entityId: LEGAL_CONTRACT_KEY,
      eventData: {
        event: DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
        companyId: "company-1",
        payload: priorContractNotice,
      },
      userId: "admin-1",
    });
    recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([recipient("admin-2", true)]);

    await interactor().invoke(NOW);

    expect(emailService.send).toHaveBeenCalledTimes(2);
    expect(emailService.send.mock.calls[0][0].react.props.documents.map((item: { name: string }) => item.name)).toEqual(
      ["Terms and Conditions", "Data Processing Agreement"],
    );
    expect(emailService.send.mock.calls[1][0].react.props.documents.map((item: { name: string }) => item.name)).toEqual(
      ["Privacy Policy", "Subprocessors"],
    );

    const contractEvent = eventService.publish.mock.calls.find(
      (call) => call[0] === DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
    );
    const informationEvent = eventService.publish.mock.calls.find(
      (call) => call[0] === DomainEvent.LEGAL_INFORMATION_NOTICE_SENT,
    );
    expect(contractEvent?.[1].payload.effectiveAt).toBe("2026-08-03T09:00:00.000Z");
    expect(informationEvent?.[1].payload.effectiveAt).toBe("2026-08-21T09:00:00.000Z");
    expect(contractEvent?.[1].payload.providerMessageId).not.toBe(informationEvent?.[1].payload.providerMessageId);
  });

  it("does not let a later administrator acceptance suppress a missing member Privacy email", async () => {
    records.push(initialAcceptance({ acceptanceType: "later-update" }));
    recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([recipient("member-1", false)]);

    await interactor().invoke(NOW);

    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(emailService.send.mock.calls[0][0].to).toBe("member-1@example.com");
  });

  it("sends the missing Subprocessor notice when a previously notified member becomes an administrator", async () => {
    records.push(
      initialAcceptance({
        versions: {
          ...currentLegalDocumentVersions(),
          privacy: "2026-08-01",
          subprocessors: "2026-08-01",
        },
        informationKey: "privacy:2026-08-01|subprocessors:2026-08-01",
      }),
    );
    recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([recipient("member-1", false)]);
    await interactor().invoke(NOW);
    expect(emailService.send.mock.calls[0][0].react.props.documents.map((item: { name: string }) => item.name)).toEqual(
      ["Privacy Policy"],
    );

    recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([recipient("member-1", true)]);
    await interactor().invoke(new Date("2026-08-08T09:00:00.000Z"));
    expect(emailService.send.mock.calls[1][0].react.props.documents.map((item: { name: string }) => item.name)).toEqual(
      ["Subprocessors"],
    );

    await interactor().invoke(new Date("2026-08-09T09:00:00.000Z"));
    expect(emailService.send).toHaveBeenCalledTimes(2);
  });

  it("reuses the first Subprocessor deadline even when an earlier Privacy-only event used the same information key", async () => {
    records.push(
      initialAcceptance({
        versions: {
          ...currentLegalDocumentVersions(),
          privacy: "2026-08-01",
          subprocessors: "2026-08-01",
        },
        informationKey: "privacy:2026-08-01|subprocessors:2026-08-01",
      }),
    );
    recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([recipient("member-1", false)]);
    await interactor().invoke(NOW);
    expect(eventService.publish.mock.calls[0][1].payload.effectiveAt).toBeNull();

    recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([recipient("member-1", true)]);
    await interactor().invoke(new Date("2026-08-08T09:00:00.000Z"));
    const firstSubprocessorDeadline = eventService.publish.mock.calls.at(-1)?.[1].payload.effectiveAt;
    expect(firstSubprocessorDeadline).toBe("2026-08-22T09:00:00.000Z");

    recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([
      recipient("member-1", true),
      recipient("admin-2", true),
    ]);
    await interactor().invoke(new Date("2026-08-10T09:00:00.000Z"));
    const laterAdminEvent = eventService.publish.mock.calls.find(
      (call) => call[0] === DomainEvent.LEGAL_INFORMATION_NOTICE_SENT && call[2].systemUserId === "admin-2",
    );
    expect(laterAdminEvent?.[1].payload.effectiveAt).toBe(firstSubprocessorDeadline);
  });

  it("still sends the contract notice to an administrator after another administrator accepted", async () => {
    const notice: LegalNoticeAuditPayload = {
      versions: currentLegalDocumentVersions(),
      contractKey: LEGAL_CONTRACT_KEY,
      informationKey: LEGAL_INFORMATION_KEY,
      changedDocuments: ["terms", "dpa"],
      recipient: { id: "admin-1", email: "admin-1@example.com" },
      locale: "en",
      noticeAt: "2026-08-07T09:00:00.000Z",
      effectiveAt: "2026-08-21T09:00:00.000Z",
      providerMessageId: "message-admin-1",
      deployedGitCommit: "a".repeat(40),
      acceptanceType: null,
    };
    records.push({
      createdAt: new Date(notice.noticeAt),
      entityId: LEGAL_CONTRACT_KEY,
      eventData: {
        event: DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
        companyId: "company-1",
        payload: notice,
      },
      userId: "admin-1",
    });
    if (!notice.effectiveAt) throw new Error("Expected a contract effective date");
    records.push(
      initialAcceptance({
        acceptanceType: "later-update",
        noticeAt: notice.noticeAt,
        effectiveAt: notice.effectiveAt,
        providerMessageId: notice.providerMessageId,
      }),
    );
    recipientRepo.findActiveLegalNoticeRecipientsUnscoped.mockResolvedValue([recipient("admin-2", true)]);

    await interactor().invoke(new Date("2026-08-08T09:00:00.000Z"));

    expect(emailService.send).toHaveBeenCalledTimes(1);
    expect(emailService.send.mock.calls[0][0].subject).toContain("for your records");
    expect(emailService.send.mock.calls[0][0].react.props.body).toContain("already accepted");
    const props = emailService.send.mock.calls[0][0].react.props;
    expect(props.deadlineLabel).toBe("Subprocessor objection deadline");
    expect(props.objections.join(" ")).toContain("No further acceptance is required");
    expect(props.objections.join(" ")).toContain("listed subprocessor change");
    expect(props.objections.join(" ")).not.toContain("restricted");
    expect(eventService.publish).toHaveBeenCalledWith(
      DomainEvent.LEGAL_CONTRACT_NOTICE_SENT,
      expect.anything(),
      expect.objectContaining({ systemUserId: "admin-2" }),
    );
  });

  it("does not send hosted legal notices in self-hosted mode", async () => {
    mockEnv.APP_MODE = "self-hosted";
    await interactor().invoke(NOW);

    expect(recipientRepo.findActiveLegalNoticeRecipientsUnscoped).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });
});
