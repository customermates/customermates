import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockEnv = vi.hoisted(() => ({
  APP_MODE: "cloud" as "cloud" | "self-hosted",
  BASE_URL: "https://customermates.com",
}));
const mockLegalDocumentNotice = vi.hoisted(() =>
  vi.fn((props: unknown) => ({
    key: null,
    props,
    type: "legal-document-notice",
  })),
);
const mockLegalDocumentNoticeInformation = vi.hoisted(() =>
  vi.fn((props: unknown) => ({
    key: null,
    props,
    type: "legal-document-notice-information",
  })),
);
const mockSupplierDeadline = vi.hoisted(() => ({
  value: null as string | null,
}));

vi.mock("@/env", () => ({ env: mockEnv }));
vi.mock("@/constants/legal-documents", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    get SUPPLIER_SUBPROCESSOR_OBJECTION_DEADLINE() {
      return mockSupplierDeadline.value;
    },
  };
});
vi.mock("@/components/emails/legal-document-notice-contract", () => ({
  default: mockLegalDocumentNotice,
}));
vi.mock("@/components/emails/legal-document-notice-information", () => ({
  default: mockLegalDocumentNoticeInformation,
}));
vi.mock("@/core/decorators/system-interactor.decorator", () => ({
  SystemInteractor: (target: unknown) => target,
}));

import { currentLegalDocumentVersions, type LegalDocumentVersions } from "@/constants/legal-documents";
import { DomainEvent } from "@/features/event/domain-events";
import type {
  LegalAcceptanceAuditPayload,
  LegalAuditRecord,
  LegalNoticeAuditPayload,
} from "@/features/legal/legal-audit.schema";
import type { LegalNoticeRecipient } from "../send-legal-document-notices.repo";
import { SendLegalDocumentNoticesInteractor } from "../send-legal-document-notices.interactor";

const NOW = new Date("2026-08-07T09:00:00.000Z");
const OLD_CREATED_AT = new Date("2026-08-01T09:00:00.000Z");

type TestLegalAuditRecord = LegalAuditRecord & { companyId: string };

function recipient(
  id: string,
  isSystemAdministrator: boolean,
  options: Partial<
    Pick<LegalNoticeRecipient, "companyId" | "companyName" | "createdAt" | "displayLanguage" | "email">
  > = {},
): LegalNoticeRecipient {
  return {
    id,
    companyId: options.companyId ?? "company-1",
    companyName: options.companyName ?? null,
    createdAt: options.createdAt ?? OLD_CREATED_AT,
    email: options.email ?? `${id}@example.com`,
    firstName: id,
    displayLanguage: options.displayLanguage ?? "en",
    formattingLocale: "system",
    isSystemAdministrator,
  };
}

function eventRecord(args: {
  event: DomainEvent.LEGAL_NOTICE_SENT | DomainEvent.LEGAL_DOCUMENTS_ACCEPTED;
  entityId: string;
  userId: string;
  companyId?: string;
  createdAt?: Date;
  payload: LegalNoticeAuditPayload | LegalAcceptanceAuditPayload;
}): TestLegalAuditRecord {
  const companyId = args.companyId ?? "company-1";
  const base = {
    companyId,
    createdAt: args.createdAt ?? NOW,
    entityId: args.entityId,
    userId: args.userId,
  };

  return args.event === DomainEvent.LEGAL_NOTICE_SENT
    ? {
        ...base,
        event: args.event,
        payload: args.payload as LegalNoticeAuditPayload,
      }
    : {
        ...base,
        event: args.event,
        payload: args.payload as LegalAcceptanceAuditPayload,
      };
}

function acceptanceRecord(
  args: {
    userId?: string;
    companyId?: string;
    createdAt?: Date;
    acceptanceType?: LegalAcceptanceAuditPayload["acceptanceType"];
    versions?: LegalDocumentVersions;
  } = {},
): TestLegalAuditRecord {
  const companyId = args.companyId ?? "company-1";
  const userId = args.userId ?? "admin-1";
  return eventRecord({
    event: DomainEvent.LEGAL_DOCUMENTS_ACCEPTED,
    entityId: companyId,
    userId,
    companyId,
    createdAt: args.createdAt,
    payload: {
      versions: args.versions ?? currentLegalDocumentVersions(),
      acceptingEmail: `${userId}@example.com`,
      acceptanceType: args.acceptanceType ?? "later-update",
    },
  });
}

function noticeRecord(args: {
  recipientId: string;
  changedDocuments: LegalNoticeAuditPayload["changedDocuments"];
  versions?: LegalDocumentVersions;
  effectiveAt?: string | null;
  companyId?: string;
  createdAt?: Date;
}): TestLegalAuditRecord {
  return eventRecord({
    event: DomainEvent.LEGAL_NOTICE_SENT,
    entityId: args.recipientId,
    userId: args.recipientId,
    companyId: args.companyId,
    createdAt: args.createdAt,
    payload: {
      versions: args.versions ?? currentLegalDocumentVersions(),
      changedDocuments: args.changedDocuments,
      recipientEmail: `${args.recipientId}@example.com`,
      effectiveAt: args.effectiveAt ?? null,
    },
  });
}

function documentNames(email: { react: { props: { documents: { name: string }[] } } }): string[] {
  return email.react.props.documents.map((document) => document.name);
}

describe("SendLegalDocumentNoticesInteractor", () => {
  let records: TestLegalAuditRecord[];
  let recipients: LegalNoticeRecipient[];
  let eventCreatedAt: Date;
  let recipientRepo: {
    findActiveLegalNoticeRecipientsUnscoped: ReturnType<typeof vi.fn>;
  };
  let auditRepo: { findLegalEventsUnscoped: ReturnType<typeof vi.fn> };
  let emailService: { send: ReturnType<typeof vi.fn> };
  let eventService: { publish: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    mockEnv.APP_MODE = "cloud";
    mockSupplierDeadline.value = null;
    records = [];
    recipients = [recipient("admin-1", true), recipient("admin-2", true), recipient("member-1", false)];
    eventCreatedAt = new Date();
    recipientRepo = {
      findActiveLegalNoticeRecipientsUnscoped: vi.fn(() => Promise.resolve(recipients)),
    };
    auditRepo = {
      findLegalEventsUnscoped: vi.fn((companyId: string) =>
        Promise.resolve(records.filter((record) => record.companyId === companyId)),
      ),
    };
    emailService = { send: vi.fn(() => Promise.resolve(true)) };
    eventService = {
      publish: vi.fn((event, data, options) => {
        records.push(
          eventRecord({
            event,
            entityId: data.entityId,
            userId: options.systemUserId,
            companyId: options.systemCompanyId,
            createdAt: eventCreatedAt,
            payload: data.payload,
          }),
        );
        return Promise.resolve();
      }),
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function interactor() {
    return new SendLegalDocumentNoticesInteractor(
      recipientRepo as never,
      auditRepo as never,
      emailService as never,
      eventService as never,
    );
  }

  async function invoke(now = NOW) {
    vi.setSystemTime(now);
    eventCreatedAt = new Date();
    return interactor().invoke();
  }

  it("rejects invalid or expired supplier objection deadlines when a Subprocessor notice is pending", async () => {
    mockSupplierDeadline.value = "not-a-date";
    await expect(invoke()).rejects.toThrow("supplier subprocessor objection deadline is invalid");

    mockSupplierDeadline.value = "2026-08-07T08:59:59.000Z";
    await expect(invoke()).rejects.toThrow("supplier subprocessor objection deadline must be in the future");

    expect(recipientRepo.findActiveLegalNoticeRecipientsUnscoped).toHaveBeenCalledTimes(2);
    expect(auditRepo.findLegalEventsUnscoped).toHaveBeenCalledTimes(2);
    expect(emailService.send).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("ignores an expired supplier deadline after valid current Subprocessor evidence exists", async () => {
    recipients = [recipient("admin-1", true)];
    records.push(
      noticeRecord({
        recipientId: "admin-1",
        changedDocuments: ["terms", "dpa", "privacy", "subprocessors"],
        effectiveAt: "2026-08-20T09:00:00.000Z",
      }),
    );

    mockSupplierDeadline.value = "2026-08-06T09:00:00.000Z";
    await expect(invoke()).resolves.toBeUndefined();

    expect(emailService.send).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("retries contract and Subprocessor notices whose recorded deadline is missing or invalid", async () => {
    recipients = [recipient("admin-1", true)];
    records.push(
      noticeRecord({
        recipientId: "admin-1",
        changedDocuments: ["terms", "dpa", "subprocessors"],
        effectiveAt: null,
      }),
    );

    await invoke();

    expect(documentNames(emailService.send.mock.calls[0][0])).toEqual([
      "Terms and Conditions",
      "Data Processing Agreement",
      "Privacy Policy",
      "Subprocessors",
    ]);
    expect(eventService.publish.mock.calls[0][1].payload.effectiveAt).toBe("2026-08-21T09:00:00.000Z");
  });

  it("preserves a separate supplier deadline for a combined notice retried on the next run", async () => {
    recipients = [recipient("admin-1", true), recipient("admin-2", true)];
    emailService.send.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const supplierDeadline = "2026-08-12T10:00:00.000Z";
    mockSupplierDeadline.value = supplierDeadline;

    await invoke();
    expect(records).toHaveLength(1);

    emailService.send.mockReset().mockResolvedValue(true);
    mockLegalDocumentNotice.mockClear();
    mockLegalDocumentNoticeInformation.mockClear();
    await invoke();

    expect(emailService.send).toHaveBeenCalledTimes(1);
    const props = emailService.send.mock.calls[0][0].react.props as {
      deadline: string;
      objections: string[];
    };
    expect(props.deadline).toBe("August 21, 2026");
    expect(props.objections).toHaveLength(2);
    expect(props.objections[1]).toContain("August 12, 2026");
    expect(eventService.publish.mock.calls.at(-1)?.[1].payload.effectiveAt).toBe("2026-08-21T09:00:00.000Z");
  });

  it("sends one combined administrator email and one Privacy-only member email, then deduplicates", async () => {
    await invoke();

    expect(emailService.send).toHaveBeenCalledTimes(3);
    expect(emailService.send.mock.calls.every((call) => call.length === 1)).toBe(true);
    expect(documentNames(emailService.send.mock.calls[0][0])).toEqual([
      "Terms and Conditions",
      "Data Processing Agreement",
      "Privacy Policy",
      "Subprocessors",
    ]);
    expect(documentNames(emailService.send.mock.calls[1][0])).toEqual([
      "Terms and Conditions",
      "Data Processing Agreement",
      "Privacy Policy",
      "Subprocessors",
    ]);
    expect(documentNames(emailService.send.mock.calls[2][0])).toEqual(["Privacy Policy"]);
    expect(emailService.send.mock.calls.map(([email]) => email.react.type)).toEqual([
      "legal-document-notice",
      "legal-document-notice",
      "legal-document-notice-information",
    ]);

    expect(eventService.publish).toHaveBeenCalledTimes(3);
    for (const [index, expectedEntityId] of ["admin-1", "admin-2", "member-1"].entries()) {
      const [event, data, options] = eventService.publish.mock.calls[index];
      expect(event).toBe(DomainEvent.LEGAL_NOTICE_SENT);
      expect(data.entityId).toBe(expectedEntityId);
      expect(options).toEqual({
        systemCompanyId: "company-1",
        systemUserId: expectedEntityId,
      });
      expect(Object.keys(data.payload).sort()).toEqual([
        "changedDocuments",
        "effectiveAt",
        "recipientEmail",
        "versions",
      ]);
      expect(data.payload).not.toHaveProperty("deployedGitCommit");
      expect(data.payload).not.toHaveProperty("providerMessageId");
    }
    expect(eventService.publish.mock.calls[0][1].payload.effectiveAt).toBe("2026-08-21T09:00:00.000Z");
    expect(eventService.publish.mock.calls[1][1].payload.effectiveAt).toBe("2026-08-21T09:00:00.000Z");
    expect(eventService.publish.mock.calls[2][1].payload.effectiveAt).toBeNull();
    expect(auditRepo.findLegalEventsUnscoped).toHaveBeenCalledTimes(1);

    emailService.send.mockClear();
    eventService.publish.mockClear();
    await invoke();
    expect(emailService.send).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
    expect(auditRepo.findLegalEventsUnscoped).toHaveBeenCalledTimes(2);
  });

  it("uses exact per-document evidence and catches up skipped releases", async () => {
    recipients = [recipient("admin-1", true)];
    records.push(
      acceptanceRecord({
        createdAt: new Date("2026-08-05T00:00:00.000Z"),
        versions: {
          dpa: "2026-08-05",
          privacy: "2026-08-05",
          subprocessors: "2026-08-05",
          terms: "2026-08-05",
        },
      }),
      noticeRecord({
        recipientId: "admin-1",
        changedDocuments: ["terms", "privacy"],
        createdAt: new Date("2026-08-06T00:00:00.000Z"),
        effectiveAt: "2026-08-20T00:00:00.000Z",
        versions: {
          ...currentLegalDocumentVersions(),
          dpa: "2026-08-06",
          subprocessors: "2026-08-06",
        },
      }),
    );

    await invoke();

    expect(documentNames(emailService.send.mock.calls[0][0])).toEqual(["Data Processing Agreement", "Subprocessors"]);
    expect(eventService.publish.mock.calls[0][1].payload.changedDocuments).toEqual(["dpa", "subprocessors"]);
  });

  it("passes the resolved app locale and locale-less live links to the email", async () => {
    recipients = [recipient("member-1", false, { displayLanguage: "fr" })];

    await invoke();

    const props = emailService.send.mock.calls[0][0].react.props as {
      documents: Array<{ liveUrl: string }>;
      locale: string;
    };
    expect(props.locale).toBe("fr");
    expect(props.documents.map((document) => document.liveUrl)).toEqual(["https://customermates.com/privacy"]);
  });

  it("formats deadlines with the formatting preference independently of display language", async () => {
    recipients = [
      {
        ...recipient("admin-1", true, { displayLanguage: "fr" }),
        formattingLocale: "de",
      },
    ];

    await invoke();

    const props = emailService.send.mock.calls[0][0].react.props as {
      deadline: string;
      documents: Array<{ version: string }>;
      locale: string;
    };
    expect(props.locale).toBe("fr");
    expect(props.deadline).toBe("21. August 2026");
    expect(props.documents.map((document) => document.version)).toEqual([
      "1. September 2026",
      "1. September 2026",
      "15. Oktober 2026",
      "15. Oktober 2026",
    ]);
  });

  it("treats initial onboarding as the creator's baseline for all current documents", async () => {
    recipients = [recipient("admin-1", true)];
    records.push(acceptanceRecord({ acceptanceType: "initial-onboarding" }));

    await invoke();

    expect(emailService.send).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("does not let a Privacy-only notice suppress Subprocessors after a member becomes an administrator", async () => {
    recipients = [recipient("promoted-user", true)];
    records.push(
      noticeRecord({
        recipientId: "promoted-user",
        changedDocuments: ["privacy"],
        versions: currentLegalDocumentVersions(),
      }),
    );

    await invoke();

    expect(documentNames(emailService.send.mock.calls[0][0])).toEqual([
      "Terms and Conditions",
      "Data Processing Agreement",
      "Subprocessors",
    ]);
  });

  it("suppresses contract mail company-wide after acceptance while sending missing information", async () => {
    recipients = [recipient("admin-2", true)];
    records.push(acceptanceRecord({ userId: "admin-1" }));

    await invoke();

    expect(documentNames(emailService.send.mock.calls[0][0])).toEqual(["Privacy Policy", "Subprocessors"]);
    expect(eventService.publish.mock.calls[0][1].payload.changedDocuments).toEqual(["privacy", "subprocessors"]);
  });

  it("reuses the first current contract deadline for later administrators", async () => {
    recipients = [recipient("admin-2", true)];
    records.push(
      noticeRecord({
        recipientId: "admin-1",
        changedDocuments: ["terms", "dpa"],
        effectiveAt: "2026-08-20T09:00:00.000Z",
        createdAt: new Date("2026-08-06T09:00:00.000Z"),
      }),
    );

    await invoke();

    expect(eventService.publish.mock.calls[0][1].payload.effectiveAt).toBe("2026-08-20T09:00:00.000Z");
  });

  it("skips a malformed first deadline and reuses the earliest valid current deadline", async () => {
    recipients = [recipient("admin-3", true)];
    records.push(
      noticeRecord({
        recipientId: "admin-1",
        changedDocuments: ["terms", "dpa"],
        effectiveAt: "not-a-date",
        createdAt: new Date("2026-08-05T09:00:00.000Z"),
      }),
      noticeRecord({
        recipientId: "admin-2",
        changedDocuments: ["terms", "dpa"],
        effectiveAt: "2026-08-20T09:00:00.000Z",
        createdAt: new Date("2026-08-06T09:00:00.000Z"),
      }),
    );

    await invoke();

    expect(eventService.publish.mock.calls[0][1].payload.effectiveAt).toBe("2026-08-20T09:00:00.000Z");
  });

  it("gives Subprocessor-only notices a shared objection deadline and Privacy-only notices none", async () => {
    recipients = [recipient("admin-2", true), recipient("member-1", false)];
    records.push(
      acceptanceRecord(),
      noticeRecord({
        recipientId: "admin-1",
        changedDocuments: ["subprocessors"],
        effectiveAt: "2026-08-19T09:00:00.000Z",
      }),
      noticeRecord({ recipientId: "admin-2", changedDocuments: ["privacy"] }),
    );

    await invoke();

    expect(documentNames(emailService.send.mock.calls[0][0])).toEqual(["Subprocessors"]);
    expect(eventService.publish.mock.calls[0][1].payload.effectiveAt).toBe("2026-08-19T09:00:00.000Z");
    expect(documentNames(emailService.send.mock.calls[1][0])).toEqual(["Privacy Policy"]);
    expect(eventService.publish.mock.calls[1][1].payload.effectiveAt).toBeNull();
  });

  it("suppresses historical information for later users but sends conservatively on the release day", async () => {
    recipients = [
      recipient("later-member", false, {
        createdAt: new Date("2026-10-16T00:00:00.000Z"),
      }),
      recipient("same-day-member", false, {
        createdAt: new Date("2026-10-15T23:59:59.000Z"),
      }),
    ];

    await invoke(new Date("2026-10-16T09:00:00.000Z"));

    expect(emailService.send).toHaveBeenCalledOnce();
    expect(emailService.send.mock.calls[0][0].to).toBe("same-day-member@example.com");
    expect(eventService.publish.mock.calls[0][1].entityId).toBe("same-day-member");
  });

  it("loads each company's audit history once and keeps its evidence isolated", async () => {
    recipients = [recipient("admin-1", true), recipient("admin-2", true, { companyId: "company-2" })];
    records.push(acceptanceRecord({ companyId: "company-1", userId: "admin-1" }));

    await invoke();

    expect(auditRepo.findLegalEventsUnscoped.mock.calls).toEqual([["company-1"], ["company-2"]]);
    expect(documentNames(emailService.send.mock.calls[0][0])).toEqual(["Privacy Policy", "Subprocessors"]);
    expect(documentNames(emailService.send.mock.calls[1][0])).toEqual([
      "Terms and Conditions",
      "Data Processing Agreement",
      "Privacy Policy",
      "Subprocessors",
    ]);
  });

  it("continues with later companies after one company's recipient delivery fails", async () => {
    recipients = [recipient("admin-1", true), recipient("admin-2", true, { companyId: "company-2" })];
    emailService.send.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await invoke();

    expect(auditRepo.findLegalEventsUnscoped.mock.calls).toEqual([["company-1"], ["company-2"]]);
    expect(emailService.send.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-1@example.com",
      "admin-2@example.com",
    ]);
    expect(eventService.publish).toHaveBeenCalledOnce();
    expect(eventService.publish.mock.calls[0][1].entityId).toBe("admin-2");
    expect(eventService.publish.mock.calls[0][2]).toEqual({
      systemCompanyId: "company-2",
      systemUserId: "admin-2",
    });
  });

  it("processes administrators before members and continues after an administrator delivery fails", async () => {
    recipients = [recipient("member-1", false), recipient("admin-1", true)];
    emailService.send.mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await invoke();

    expect(emailService.send.mock.calls.map(([email]) => email.to)).toEqual([
      "admin-1@example.com",
      "member-1@example.com",
    ]);
    expect(eventService.publish).toHaveBeenCalledOnce();
    expect(eventService.publish.mock.calls[0][1].entityId).toBe("member-1");
  });

  it("preserves surrounding successes and retries only the failed recipient", async () => {
    emailService.send.mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

    await invoke();
    expect(emailService.send).toHaveBeenCalledTimes(3);
    expect(eventService.publish).toHaveBeenCalledTimes(2);
    expect(eventService.publish.mock.calls.map(([, data]) => data.entityId)).toEqual(["admin-1", "member-1"]);

    emailService.send.mockClear();
    eventService.publish.mockClear();
    emailService.send.mockResolvedValue(true);
    await invoke(new Date("2026-08-08T09:00:00.000Z"));

    expect(emailService.send).toHaveBeenCalledOnce();
    expect(emailService.send.mock.calls[0][0].to).toBe("admin-2@example.com");
    expect(eventService.publish).toHaveBeenCalledOnce();
    expect(eventService.publish.mock.calls[0][1].entityId).toBe("admin-2");
  });

  it("propagates unexpected email failures unchanged without attempting later recipients", async () => {
    const deliveryFailure = new TypeError("email rendering failed");
    emailService.send.mockRejectedValueOnce(deliveryFailure);

    const error = await invoke().catch((cause: unknown) => cause);

    expect(error).toBe(deliveryFailure);
    expect(emailService.send).toHaveBeenCalledOnce();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("fails immediately when audit publication fails after a successful delivery", async () => {
    const auditFailure = new Error("audit persistence unavailable");
    eventService.publish.mockRejectedValueOnce(auditFailure);

    const error = await invoke().catch((cause: unknown) => cause);

    expect(error).toBe(auditFailure);
    expect(emailService.send).toHaveBeenCalledOnce();
    expect(eventService.publish).toHaveBeenCalledOnce();
  });

  it("sends the Privacy notice once per login across workspaces and records it for every membership", async () => {
    recipients = [
      recipient("member-a", false, { companyId: "company-1", email: "shared@example.com" }),
      recipient("member-b", false, { companyId: "company-2", email: "Shared@Example.com" }),
    ];

    await invoke();

    expect(emailService.send).toHaveBeenCalledOnce();
    expect(emailService.send.mock.calls[0][0].to).toBe("shared@example.com");
    expect(emailService.send.mock.calls[0][0].subject).toBe("Customermates legal information updated");
    expect(documentNames(emailService.send.mock.calls[0][0])).toEqual(["Privacy Policy"]);
    expect(
      eventService.publish.mock.calls.map(([, data, options]) => [
        data.entityId,
        options.systemCompanyId,
        data.payload.changedDocuments,
        data.payload.effectiveAt,
      ]),
    ).toEqual([
      ["member-a", "company-1", ["privacy"], null],
      ["member-b", "company-2", ["privacy"], null],
    ]);

    emailService.send.mockClear();
    eventService.publish.mockClear();
    await invoke(new Date("2026-08-08T09:00:00.000Z"));
    expect(emailService.send).not.toHaveBeenCalled();
    expect(eventService.publish).not.toHaveBeenCalled();
  });

  it("lets a workspace notice carry the Privacy notice of the same person's other memberships", async () => {
    recipients = [
      recipient("member-b", false, { companyId: "company-2", email: "shared@example.com" }),
      recipient("admin-a", true, { companyId: "company-1", companyName: "Acme", email: "shared@example.com" }),
    ];

    await invoke();

    expect(emailService.send).toHaveBeenCalledOnce();
    const [email] = emailService.send.mock.calls[0];
    expect(email.subject).toBe("Action required for “Acme”: updated Customermates legal documents");
    expect(documentNames(email)).toEqual([
      "Terms and Conditions",
      "Data Processing Agreement",
      "Privacy Policy",
      "Subprocessors",
    ]);
    expect(
      eventService.publish.mock.calls.map(([, data, options]) => [
        data.entityId,
        options.systemCompanyId,
        data.payload.changedDocuments,
      ]),
    ).toEqual([
      ["admin-a", "company-1", ["terms", "dpa", "privacy", "subprocessors"]],
      ["member-b", "company-2", ["privacy"]],
    ]);
  });

  it("keeps contract notices per workspace and names every workspace that has a name", async () => {
    recipients = [
      recipient("admin-a", true, { companyId: "company-1", companyName: "Acme", email: "owner@example.com" }),
      recipient("admin-b", true, { companyId: "company-2", email: "owner@example.com" }),
    ];

    await invoke();

    expect(emailService.send).toHaveBeenCalledTimes(2);
    const [named, unnamed] = emailService.send.mock.calls.map(([email]) => email);
    expect(named.subject).toBe("Action required for “Acme”: updated Customermates legal documents");
    expect(named.react.props.subject).toBe(named.subject);
    expect(named.react.props.body).toBe(
      "We updated the legal documents listed below for the workspace “Acme”. Please review them for the business customer and arrange electronic acceptance by an authorised system administrator.",
    );
    expect(unnamed.subject).toBe("Action required: updated Customermates legal documents");
    expect(unnamed.react.props.body).not.toContain("workspace");
    expect(eventService.publish.mock.calls.map(([, data]) => data.entityId)).toEqual(["admin-a", "admin-b"]);
  });

  it("names the workspace in a Subprocessor notice but never in a personal Privacy notice", async () => {
    recipients = [
      recipient("admin-a", true, { companyId: "company-1", companyName: "Acme" }),
      recipient("member-c", false, { companyId: "company-2", companyName: "Beta" }),
    ];
    records.push(acceptanceRecord({ companyId: "company-1", userId: "someone-else" }));

    await invoke();

    const [subprocessorNotice, privacyNotice] = emailService.send.mock.calls.map(([email]) => email);
    expect(documentNames(subprocessorNotice)).toEqual(["Privacy Policy", "Subprocessors"]);
    expect(subprocessorNotice.subject).toBe("Customermates legal information updated for “Acme”");
    expect(subprocessorNotice.react.props.body).toContain("for the workspace “Acme”");
    expect(documentNames(privacyNotice)).toEqual(["Privacy Policy"]);
    expect(privacyNotice.subject).toBe("Customermates legal information updated");
    expect(privacyNotice.react.props.body).not.toContain("Beta");
  });

  it("localizes the workspace name in the formal German contract notice", async () => {
    recipients = [
      recipient("admin-a", true, { companyId: "company-1", companyName: "Bergmann Steuern", displayLanguage: "de" }),
    ];

    await invoke();

    const [email] = emailService.send.mock.calls[0];
    expect(email.subject).toBe(
      "Handlung erforderlich für „Bergmann Steuern“: aktualisierte Customermates-Rechtsdokumente",
    );
    expect(email.react.props.body).toContain("für den Workspace „Bergmann Steuern“");
  });

  it("retries every membership a failed shared delivery covered", async () => {
    recipients = [
      recipient("member-a", false, { companyId: "company-1", email: "shared@example.com" }),
      recipient("member-b", false, { companyId: "company-2", email: "shared@example.com" }),
    ];
    emailService.send.mockResolvedValueOnce(false);

    await invoke();
    expect(emailService.send).toHaveBeenCalledOnce();
    expect(eventService.publish).not.toHaveBeenCalled();

    emailService.send.mockClear().mockResolvedValue(true);
    await invoke(new Date("2026-08-08T09:00:00.000Z"));
    expect(emailService.send).toHaveBeenCalledOnce();
    expect(eventService.publish.mock.calls.map(([, data]) => data.entityId)).toEqual(["member-a", "member-b"]);
  });

  it("is a no-op outside managed cloud mode", async () => {
    mockEnv.APP_MODE = "self-hosted";

    await invoke();

    expect(recipientRepo.findActiveLegalNoticeRecipientsUnscoped).not.toHaveBeenCalled();
    expect(auditRepo.findLegalEventsUnscoped).not.toHaveBeenCalled();
    expect(emailService.send).not.toHaveBeenCalled();
  });
});
