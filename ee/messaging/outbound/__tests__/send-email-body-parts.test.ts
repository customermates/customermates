import type * as InboxSchemaModule from "../../inbox/inbox.schema";
import type { EmailBodyFormat } from "../email-signature";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { MessagingMessageDirection, MessagingProvider } from "@/generated/prisma";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
  createMockDiModule,
} from "@/tests/helpers/interactor-test-setup";

import {
  EmailFontFamily,
  EmailLinkStyle,
  SIGNATURE_LOGO_URL,
  SignatureTemplate,
  defaultEmailSettings,
} from "../../email-settings";
import { SendEmailInteractor } from "../send-email.interactor";

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

const emailSettings = defaultEmailSettings();
emailSettings.appearance = {
  fontFamily: EmailFontFamily.serif,
  fontSize: 16,
  linkHex: "#d23128",
  linkStyle: EmailLinkStyle.plain,
};
emailSettings.signature = {
  ...emailSettings.signature,
  enabled: true,
  template: SignatureTemplate.sideBySide,
  logoUrl: SIGNATURE_LOGO_URL,
};

const signatureMarkdown = [
  "**Benjamin Wagner**",
  "Founder at Customermates",
  "[mail@customermates.com](mailto:mail@customermates.com)",
  "[customermates.com](https://customermates.com)",
].join("  \n");

const persistedRow = {
  id: "00000000-0000-4000-8000-000000000004",
  messagingThreadId: THREAD_ID,
  connectedAccountId: ACCOUNT_ID,
  providerMessageId: null,
  provider: MessagingProvider.google,
  direction: MessagingMessageDirection.outbound,
  sender: {
    attendeeId: "me@example.com",
    displayName: "Me",
    identifier: "me@example.com",
    isSelf: true,
  },
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

async function send(
  signature: string | null,
  body: string,
  signatureFields: unknown = null,
  bodyFormat?: Exclude<EmailBodyFormat, "auto">,
) {
  const service = {
    sendEmail: vi.fn().mockResolvedValue({ ok: true, data: { id: "u-1", messageId: "m-1" } }),
    getEmailAttachments: vi.fn(),
  };
  const repo = makeRepo();
  const interactor = new SendEmailInteractor(
    repo as never,
    {
      findUsableAccountByIdOrThrow: vi.fn().mockResolvedValue(makeAccount(signature, signatureFields)),
    } as never,
    service as never,
    mockEntitlementService(),
  );

  await interactor.invoke({
    threadId: THREAD_ID,
    to: [{ identifier: "you@example.com" }],
    subject: "S",
    body,
    ...(bodyFormat ? { bodyFormat } : {}),
  });

  return {
    sent: service.sendEmail.mock.calls[0][0],
    persisted: repo.persistOutboundMessageOrThrow.mock.calls[0][0],
  };
}

describe("SendEmailInteractor body parts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends both alternative parts for plain-text API callers", async () => {
    const { sent } = await send(null, "line one\nline two");

    expect(sent.plainText).toBe("line one\nline two");
    expect(sent.body).toContain("line one<br>line two");
    expect(sent.body).toContain("font-family:Arial,Helvetica,sans-serif");
  });

  it("renders Markdown body and signature with the account theme", async () => {
    const { sent } = await send(
      signatureMarkdown,
      "Hello **there**\n\n[Project](https://example.com)",
      emailSettings,
      "markdown",
    );

    expect(sent.plainText).toContain("Hello there\n\nProject (https://example.com)");
    expect(sent.plainText).toContain("\n\n-- \nBenjamin Wagner");
    expect(sent.body).toContain("<strong>there</strong>");
    expect(sent.body).toContain("font-family:Georgia,'Times New Roman',serif");
    expect(sent.body).toContain("font-size:16px");
    expect(sent.body).toContain("color:#d23128;text-decoration:none");
    expect(sent.body).toContain('<table role="presentation"');
    expect(sent.body).toContain(SIGNATURE_LOGO_URL);
    expect(sent.body).toContain('width="56" alt=""');
    expect(sent.body).toContain("height:auto");
  });

  it("persists exactly the rendered wire parts", async () => {
    const { sent, persisted } = await send(signatureMarkdown, "Hello", emailSettings, "markdown");

    expect(persisted.message.bodyText).toBe(sent.plainText);
    expect(persisted.message.bodyHtml).toBe(sent.body);
  });

  it("escapes a plain-text body so it cannot be read as markup", async () => {
    const { sent } = await send(null, "a < b & c");

    expect(sent.body).toContain("a &lt; b &amp; c");
    expect(sent.body).not.toContain("a < b");
  });

  it("does not append a configured signature while its toggle is off", async () => {
    const disabled = structuredClone(emailSettings);
    disabled.signature.enabled = false;
    const { sent } = await send(signatureMarkdown, "Hello", disabled, "markdown");

    expect(sent.plainText).toBe("Hello");
    expect(sent.body).not.toContain("Benjamin Wagner");
    expect(sent.body).not.toContain("<table");
  });

  it("upgrades legacy structured fields before sending", async () => {
    const legacy = {
      template: SignatureTemplate.plain,
      accent: "green",
      fullName: "Benjamin Wagner",
      website: "customermates.com",
    };
    const { sent } = await send(null, "Hello", legacy, "markdown");

    expect(sent.plainText).toContain("Benjamin Wagner");
    expect(sent.body).toContain("color:#2ba449");
    expect(sent.body).toContain('href="https://customermates.com"');
  });
});
