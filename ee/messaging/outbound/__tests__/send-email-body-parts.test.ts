import type * as InboxSchemaModule from "../../inbox/inbox.schema";

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
  getTranslations: () => Promise.resolve((key: string) => key),
  getLocale: () => Promise.resolve("en"),
}));
vi.mock("../../inbox/inbox.schema", async (importActual) => ({
  ...(await importActual<typeof InboxSchemaModule>()),
  toMessagingMessageDto: (message: unknown) => message,
}));

import { SendEmailInteractor } from "../send-email.interactor";
import { MessagingProvider, MessagingMessageDirection } from "@/generated/prisma";
import { SIGNATURE_LOGO_URL, SignatureFieldsSchema, SignatureTemplate } from "../../signature-fields";

const ACCOUNT_ID = "00000000-0000-4000-8000-000000000002";
const THREAD_ID = "00000000-0000-4000-8000-000000000003";

const thread = {
  id: THREAD_ID,
  connectedAccountId: ACCOUNT_ID,
  unipileThreadId: "t-1",
  provider: MessagingProvider.google,
  type: "single",
} as never;

function makeAccount(signature: string | null, signatureFields: unknown = null) {
  return {
    id: ACCOUNT_ID,
    unipileAccountId: "acc-1",
    emailAddress: "me@example.com",
    displayName: "Me",
    provider: MessagingProvider.google,
    sentFolderIds: [],
    signature,
    signatureFields,
  } as never;
}

const structuredFields = SignatureFieldsSchema.parse({
  template: SignatureTemplate.sideBySide,
  fullName: "Benjamin Wagner",
  jobTitle: "Founder",
  company: "Customermates",
  email: "mail@customermates.com",
  phone: "+49 170 0000000",
  website: "customermates.com",
  logoUrl: SIGNATURE_LOGO_URL,
});

const persistedRow = {
  id: "00000000-0000-4000-8000-000000000004",
  messagingThreadId: THREAD_ID,
  connectedAccountId: ACCOUNT_ID,
  providerMessageId: null,
  provider: MessagingProvider.google,
  direction: MessagingMessageDirection.outbound,
  sender: { attendeeId: "me@example.com", displayName: "Me", identifier: "me@example.com", isSelf: true },
  recipients: { to: [], cc: [], bcc: [] },
  subject: "S",
  bodyText: "Hello",
  bodyHtml: "Hello",
  attachmentsMeta: [],
  isEvent: false,
  isDeleted: false,
  isHidden: false,
  isDraft: false,
  draftRevision: null,
  sentAt: new Date(),
  editedAt: null,
  reactions: [],
};

function makeRepo() {
  return {
    findThreadByIdOrThrow: vi.fn().mockResolvedValue(thread),
    findLatestEmailReplyReferenceForThread: vi.fn().mockResolvedValue(null),
    findDraftById: vi.fn().mockResolvedValue(null),
    findRecentOutboundDuplicate: vi.fn().mockResolvedValue(null),
    persistOutboundMessageOrThrow: vi.fn().mockResolvedValue(persistedRow),
    convertDraftToSent: vi.fn(),
  };
}

async function send(signature: string | null, body: string, signatureFields: unknown = null) {
  const service = {
    sendEmail: vi.fn().mockResolvedValue({ ok: true, data: { id: "u-1", messageId: "m-1" } }),
    getEmailAttachments: vi.fn(),
  };
  const repo = makeRepo();
  const interactor = new SendEmailInteractor(
    repo as never,
    { findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(makeAccount(signature, signatureFields)) } as never,
    service as never,
    mockEntitlementService(),
  );

  await interactor.invoke({ threadId: THREAD_ID, to: [{ identifier: "you@example.com" }], subject: "S", body });

  return { sent: service.sendEmail.mock.calls[0][0], persisted: repo.persistOutboundMessageOrThrow.mock.calls[0][0] };
}

describe("SendEmailInteractor body parts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends both alternative parts, not html alone", async () => {
    const { sent } = await send(null, "line one\nline two");

    expect(sent.plainText).toBe("line one\nline two");
    expect(sent.body).toBe("line one<br>line two");
  });

  it("puts the markdown signature in the plain part and the rendered one in the html part", async () => {
    const { sent } = await send("**Ben**\n[site](https://example.com)", "Hello");

    expect(sent.plainText).toBe("Hello\n\n-- \n**Ben**\n[site](https://example.com)");
    expect(sent.body).toBe(
      'Hello<div data-customermates-signature="true"><br><br>-- <br><p><strong>Ben</strong><br>\n<a href="https://example.com">site</a></p></div>',
    );
  });

  it("persists what was actually sent on both columns", async () => {
    const { persisted } = await send("Ben", "Hello");

    expect(persisted.message.bodyText).toBe("Hello\n\n-- \nBen");
    expect(persisted.message.bodyHtml).toBe(
      'Hello<div data-customermates-signature="true"><br><br>-- <br><p>Ben</p></div>',
    );
  });

  it("escapes a plain-text body so it cannot be read as markup", async () => {
    const { sent } = await send(null, "a < b & c");

    expect(sent.body).toBe("a &lt; b &amp; c");
  });

  it("puts the structured signature table on the wire once fields are stored", async () => {
    const { sent } = await send("Hauptstrasse 1, 68159 Mannheim", "Hello", structuredFields);

    expect(sent.body).toContain('<table role="presentation"');
    expect(sent.body).toContain(SIGNATURE_LOGO_URL);
    expect(sent.body).toContain('width="56" height="56"');
    expect(sent.body).toContain('href="mailto:mail@customermates.com"');
    expect(sent.body.startsWith('Hello<div data-customermates-signature="true"><br><br>-- <br><table')).toBe(true);
  });

  it("sends a de-marked plain part alongside it, never the raw markdown", async () => {
    const { sent } = await send("**Bold** and [a link](https://example.com)", "Hello", structuredFields);

    expect(sent.plainText).toBe(
      [
        "Hello",
        "",
        "-- ",
        "Benjamin Wagner",
        "Founder, Customermates",
        "+49 170 0000000",
        "mail@customermates.com",
        "https://customermates.com",
        "Bold and a link (https://example.com)",
      ].join("\n"),
    );
    expect(sent.plainText).not.toContain("**");
    expect(sent.plainText).not.toContain(SIGNATURE_LOGO_URL);
  });

  it("never ships an html-only message, since plain_text is only spread in when truthy", async () => {
    const { sent } = await send(null, "Hello", structuredFields);

    expect(sent.plainText.trim().length).toBeGreaterThan(0);
    expect(sent.body.length).toBeGreaterThan(0);
  });

  it("persists the structured signature on both columns", async () => {
    const { persisted } = await send(null, "Hello", structuredFields);

    expect(persisted.message.bodyHtml).toContain('<table role="presentation"');
    expect(persisted.message.bodyText).toContain("Benjamin Wagner");
    expect(persisted.message.bodyText).not.toContain("<table");
  });
});
