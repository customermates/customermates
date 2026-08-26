import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
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
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { StartChatInteractor } from "../start-chat.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { MessagingProvider, MessagingMessageDirection } from "@/generated/prisma";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
const THREAD_ID = "00000000-0000-4000-8000-000000000003";
const WHATSAPP_NUMBER = "+49 176 56945421";
const NORMALIZED_NUMBER = "+4917656945421";

const linkedinAccount = {
  id: ACCOUNT_ID,
  unipileAccountId: "acc-1",
  provider: MessagingProvider.linkedin,
  displayName: "Me",
  linkedinProducts: ["classic", "sales_navigator", "recruiter"],
} as never;

const classicOnlyAccount = {
  id: ACCOUNT_ID,
  unipileAccountId: "acc-1",
  provider: MessagingProvider.linkedin,
  displayName: "Me",
  linkedinProducts: ["classic"],
} as never;

const whatsappAccount = {
  id: ACCOUNT_ID,
  unipileAccountId: "acc-1",
  provider: MessagingProvider.whatsapp,
  displayName: "Me",
  linkedinProducts: [],
} as never;

function makeInteractor(account: unknown, service: any, threadRepo: any = { persistOutboundMessageOrThrow: vi.fn() }) {
  return new StartChatInteractor(
    { findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(account) } as never,
    {
      findContactChannelCompanyWide: vi
        .fn()
        .mockResolvedValue({ id: "ch-1", messagingId: "prov-1", displayName: "Ada", profileUrl: null }),
      saveResolvedContactChannel: vi.fn(),
    } as never,
    service,
    threadRepo,
    mockEntitlementService(),
  );
}

describe("StartChatInteractor inbox routing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends through the primary inbox for a linkedin account", async () => {
    const service = {
      listInboxes: vi.fn().mockResolvedValue({
        data: [
          { object: "Inbox", id: "CLASSIC_ARCHIVED", disabled: false },
          { object: "Inbox", id: "CLASSIC_PRIMARY", disabled: false },
        ],
      }),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: null, messageId: null } }),
    };

    const result: any = await makeInteractor(linkedinAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
    });

    expect(result).toEqual({ ok: true, data: { threadId: null } });
    expect(service.startChat).toHaveBeenCalledWith(expect.objectContaining({ inboxId: "CLASSIC_PRIMARY" }));
  });

  it("falls back to the account-scoped send when listing inboxes fails", async () => {
    const service = {
      listInboxes: vi.fn().mockRejectedValue(new Error("boom")),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: null, messageId: null } }),
    };

    const result: any = await makeInteractor(linkedinAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
    });

    expect(result.ok).toBe(true);
    expect(service.listInboxes).toHaveBeenCalledTimes(1);
    expect(service.startChat.mock.calls[0][0].inboxId).toBeUndefined();
  });

  it("never lists inboxes for a whatsapp account", async () => {
    const service = {
      listInboxes: vi.fn(),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: null, messageId: null } }),
    };

    const result: any = await makeInteractor(whatsappAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: [WHATSAPP_NUMBER],
      text: "hello there",
    });

    expect(result.ok).toBe(true);
    expect(service.listInboxes).not.toHaveBeenCalled();
    expect(service.startChat).toHaveBeenCalledWith(expect.objectContaining({ usersIds: [NORMALIZED_NUMBER] }));
    expect(service.startChat.mock.calls[0][0].inboxId).toBeUndefined();
  });
});

describe("StartChatInteractor linkedin products", () => {
  beforeEach(() => vi.clearAllMocks());

  const productInboxes = {
    data: [
      { object: "Inbox", id: "CLASSIC_PRIMARY", disabled: false },
      { object: "Inbox", id: "SALES_NAVIGATOR_PRIMARY", disabled: false },
      { object: "Inbox", id: "RECRUITER_PRIMARY", disabled: false },
    ],
  };

  it("sends a sales navigator inmail through SALES_NAVIGATOR_PRIMARY with the subject specifics", async () => {
    const service = {
      listInboxes: vi.fn().mockResolvedValue(productInboxes),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: null, messageId: null } }),
    };

    const result: any = await makeInteractor(linkedinAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
      linkedinProduct: "sales_navigator",
      inmailSubject: "New business opportunity",
    });

    expect(result.ok).toBe(true);
    expect(service.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "SALES_NAVIGATOR_PRIMARY",
        specifics: { linkedin: { sales_navigator: { subject: "New business opportunity" } } },
      }),
    );
  });

  it("sends a recruiter inmail through RECRUITER_PRIMARY with subject and signature specifics", async () => {
    const service = {
      listInboxes: vi.fn().mockResolvedValue(productInboxes),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: null, messageId: null } }),
    };

    const result: any = await makeInteractor(linkedinAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
      linkedinProduct: "recruiter",
      inmailSubject: "Open to work?",
      inmailSignature: "Benjamin Wagner",
    });

    expect(result.ok).toBe(true);
    expect(service.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "RECRUITER_PRIMARY",
        specifics: { linkedin: { recruiter: { subject: "Open to work?", signature: "Benjamin Wagner" } } },
      }),
    );
  });

  it("sends a classic inmail through CLASSIC_PRIMARY with the inmail flag", async () => {
    const service = {
      listInboxes: vi.fn().mockResolvedValue(productInboxes),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: null, messageId: null } }),
    };

    const result: any = await makeInteractor(linkedinAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
      inmail: true,
    });

    expect(result.ok).toBe(true);
    expect(service.startChat).toHaveBeenCalledWith(
      expect.objectContaining({
        inboxId: "CLASSIC_PRIMARY",
        specifics: { linkedin: { classic: { inmail: true } } },
      }),
    );
  });

  it("never falls back to another inbox when the product inbox is missing", async () => {
    const service = {
      listInboxes: vi.fn().mockResolvedValue({
        data: [{ object: "Inbox", id: "CLASSIC_PRIMARY", disabled: false }],
      }),
      startChat: vi.fn(),
    };

    const result: any = await makeInteractor(linkedinAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
      linkedinProduct: "sales_navigator",
      inmailSubject: "New business opportunity",
    });

    expect(result.ok).toBe(false);
    expect(result.error.issues.some((issue: any) => issue.message === "Common.errors.linkedinInboxUnavailable")).toBe(
      true,
    );
    expect(service.startChat).not.toHaveBeenCalled();
  });

  it("rejects a product the account does not have", async () => {
    const service = { listInboxes: vi.fn(), startChat: vi.fn() };

    const result: any = await makeInteractor(classicOnlyAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
      linkedinProduct: "sales_navigator",
      inmailSubject: "New business opportunity",
    });

    expect(result.ok).toBe(false);
    expect(
      result.error.issues.some((issue: any) => issue.params?.error === CustomErrorCode.linkedinProductUnavailable),
    ).toBe(true);
    expect(service.startChat).not.toHaveBeenCalled();
  });

  it("allows a product the account has (does not reject on availability)", async () => {
    const service = {
      listInboxes: vi.fn().mockResolvedValue(productInboxes),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: null, messageId: null } }),
    };

    const result: any = await makeInteractor(classicOnlyAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects an inmail without a subject at validation", async () => {
    const service = { listInboxes: vi.fn(), startChat: vi.fn() };

    const result: any = await makeInteractor(linkedinAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
      linkedinProduct: "sales_navigator",
    });

    expect(result.ok).toBe(false);
    expect(
      result.error.issues.some((issue: any) => issue.params?.error === CustomErrorCode.inmailSubjectRequired),
    ).toBe(true);
    expect(service.startChat).not.toHaveBeenCalled();
  });

  it("rejects linkedin product options on a non-linkedin account", async () => {
    const service = { listInboxes: vi.fn(), startChat: vi.fn() };

    const result: any = await makeInteractor(whatsappAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: [WHATSAPP_NUMBER],
      text: "hello there",
      linkedinProduct: "sales_navigator",
      inmailSubject: "New business opportunity",
    });

    expect(result.ok).toBe(false);
    expect(
      result.error.issues.some((issue: any) => issue.params?.error === CustomErrorCode.linkedinProductRequiresLinkedin),
    ).toBe(true);
    expect(service.startChat).not.toHaveBeenCalled();
  });

  it("sends a plain classic chat without specifics by default", async () => {
    const service = {
      listInboxes: vi.fn().mockResolvedValue(productInboxes),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: null, messageId: null } }),
    };

    const result: any = await makeInteractor(linkedinAccount, service).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
    });

    expect(result.ok).toBe(true);
    expect(service.startChat.mock.calls[0][0].inboxId).toBe("CLASSIC_PRIMARY");
    expect(service.startChat.mock.calls[0][0].specifics).toBeUndefined();
  });
});

describe("StartChatInteractor persistence", () => {
  beforeEach(() => vi.clearAllMocks());

  it("persists the outbound message and returns the persisted thread id", async () => {
    const service = {
      listInboxes: vi.fn(),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: "chat_1", messageId: "msg_1" } }),
    };
    const threadRepo = {
      persistOutboundMessageOrThrow: vi.fn().mockResolvedValue({ messagingThreadId: THREAD_ID }),
    };

    const result: any = await makeInteractor(whatsappAccount, service, threadRepo).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: [WHATSAPP_NUMBER],
      text: "hello there",
    });

    expect(result).toEqual({ ok: true, data: { threadId: THREAD_ID } });
    const call = threadRepo.persistOutboundMessageOrThrow.mock.calls[0][0];
    expect(call.connectedAccountId).toBe(ACCOUNT_ID);
    expect(call.message.unipileThreadId).toBe("chat_1");
    expect(call.message.unipileMessageId).toBe("msg_1");
    expect(call.message.direction).toBe(MessagingMessageDirection.outbound);
    expect(call.message.recipients.to).toHaveLength(1);
    expect(call.message.recipients.to[0].identifier).toBe(NORMALIZED_NUMBER);
  });

  it("does not persist a subject for a classic send even when inmailSubject is supplied", async () => {
    const service = {
      listInboxes: vi.fn().mockResolvedValue({ data: [{ object: "Inbox", id: "CLASSIC_PRIMARY", disabled: false }] }),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: "chat_1", messageId: "msg_1" } }),
    };
    const threadRepo = {
      persistOutboundMessageOrThrow: vi.fn().mockResolvedValue({ messagingThreadId: THREAD_ID }),
    };

    const result: any = await makeInteractor(linkedinAccount, service, threadRepo).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: ["ada-lovelace"],
      text: "hello there",
      inmailSubject: "phantom",
    });

    expect(result.ok).toBe(true);
    expect(service.startChat.mock.calls[0][0].specifics).toBeUndefined();
    expect(threadRepo.persistOutboundMessageOrThrow.mock.calls[0][0].message.subject).toBeNull();
  });

  it("returns a null thread id without persisting when the provider reports no chat id", async () => {
    const service = {
      listInboxes: vi.fn(),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: null, messageId: "msg_1" } }),
    };
    const threadRepo = { persistOutboundMessageOrThrow: vi.fn() };

    const result: any = await makeInteractor(whatsappAccount, service, threadRepo).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: [WHATSAPP_NUMBER],
      text: "hello there",
    });

    expect(result).toEqual({ ok: true, data: { threadId: null } });
    expect(threadRepo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
  });

  it("still returns ok with a null thread id when persisting throws after a successful send", async () => {
    const service = {
      listInboxes: vi.fn(),
      startChat: vi.fn().mockResolvedValue({ ok: true, data: { chatId: "chat_1", messageId: "msg_1" } }),
    };
    const threadRepo = { persistOutboundMessageOrThrow: vi.fn().mockRejectedValue(new Error("db down")) };

    const result: any = await makeInteractor(whatsappAccount, service, threadRepo).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: [WHATSAPP_NUMBER],
      text: "hello there",
    });

    expect(result).toEqual({ ok: true, data: { threadId: null } });
    expect(threadRepo.persistOutboundMessageOrThrow).toHaveBeenCalledTimes(1);
  });

  it("maps a failed send to a validation error", async () => {
    const service = {
      listInboxes: vi.fn(),
      startChat: vi.fn().mockResolvedValue({ ok: false, error: CustomErrorCode.unipileServiceUnavailable }),
    };
    const threadRepo = { persistOutboundMessageOrThrow: vi.fn() };

    const result: any = await makeInteractor(whatsappAccount, service, threadRepo).invoke({
      connectedAccountId: ACCOUNT_ID,
      attendeeIdentifiers: [WHATSAPP_NUMBER],
      text: "hello there",
    });

    expect(result.ok).toBe(false);
    expect(result.error.issues.some((issue: any) => issue.message === "Common.errors.unipileServiceUnavailable")).toBe(
      true,
    );
    expect(threadRepo.persistOutboundMessageOrThrow).not.toHaveBeenCalled();
  });
});
