import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";
import type { EmailSettings } from "@/ee/messaging/email-settings";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  clipboard: vi.fn(),
  loadDraft: vi.fn(),
  discardDraft: vi.fn(),
  send: vi.fn(),
  sendDraft: vi.fn(),
  getDeliveryStatus: () => undefined,
  retrySend: vi.fn(),
  canRetry: vi.fn((_id: string) => true),
  messageStatus: {} as Record<string, string>,
  thread: { isOwner: true, accountShared: false } as { isOwner: boolean; accountShared: boolean } | null,
  timelineEntry: null as ActivityEntryDto | null,
  accounts: [] as Array<{
    id: string;
    signature: string;
    emailSettings: EmailSettings;
  }>,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("@/core/utils/use-copy-to-clipboard", () => ({ useCopyToClipboard: () => harness.clipboard }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    messagingThreadDetailStore: {
      messageStatus: harness.messageStatus,
      thread: harness.thread,
      movingThreadIds: new Set(),
    },
    threadComposeStore: {
      ...harness,
      draftAttachments: [],
      pendingAttachments: {},
    },
    threadParticipantsStore: { setOpen: vi.fn() },
    connectedAccountsStore: { items: harness.accounts },
    userStore: { can: () => true },
    timelineDetailModalStore: {
      isOpen: true,
      form: { entry: harness.timelineEntry, customColumns: [] },
      close: vi.fn(),
    },
  }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatNumericalShortDateTime: () => "Date",
    formatTime: () => "Time",
    formatNumber: (value: number) => String(value),
    collator: new Intl.Collator("en"),
  }),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => action(),
}));
vi.mock("@/components/modal", () => ({
  AppModal: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement("section", { "data-modal-title": title }, children),
}));
vi.mock("@/components/ui/avatar", () => ({
  Avatar: () => createElement("span", { "data-avatar": true }),
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
}));
vi.mock("../activities/audit-detail", () => ({ AuditDetail: () => null }));
vi.mock("../activities/activities-row", () => ({
  DetailHeader: ({ title }: { title: string }) => createElement("h2", {}, title),
  IdentityAvatar: () => null,
  TypeBadge: () => null,
}));
vi.mock("@/app/[locale]/(protected)/inbox/components/message-attachment", () => ({
  MessageAttachment: ({ att }: { att: { id: string } }) => createElement("span", { "data-attachment": att.id }),
}));

import { MessageItem } from "@/app/[locale]/(protected)/inbox/components/message-item";
import { EmailMessageHeader } from "@/app/[locale]/(protected)/inbox/components/email-message-header";
import { MessageDetail, TimelineDetailModal } from "../activities/activities-detail-modal";
import { hasLoadableRemoteImages, MessageBody } from "../message-body";
import { MessageSurface } from "../message-surface";
import { defaultEmailSettings } from "@/ee/messaging/email-settings";
import { composeEmailBodies } from "@/ee/messaging/outbound/email-signature";

const BASE: MessagingMessageDto = {
  id: "00000000-0000-4000-8000-000000000001",
  connectedAccountId: "00000000-0000-4000-8000-000000000003",
  messagingThreadId: "00000000-0000-4000-8000-000000000004",
  provider: "google",
  direction: "outbound",
  sender: {
    records: [],
    attendeeId: "sender",
    identifier: "sender@example.com",
    displayName: "Sender",
    isSelf: true,
  },
  recipients: {
    to: [
      {
        records: [],
        attendeeId: "recipient",
        identifier: "recipient@example.com",
        displayName: "Recipient",
      },
    ],
    cc: [],
    bcc: [],
  },
  subject: "Email subject",
  bodyText: "Hello",
  bodyHtml: "<p>Hello</p>",
  attachmentsMeta: [],
  reactions: [],
  isDraft: false,
  isEvent: false,
  isDeleted: false,
  isHidden: false,
  editedAt: null,
  sentAt: new Date("2026-09-05T12:00:00Z"),
  draftRevision: null,
};

function entry(message: MessagingMessageDto): Extract<ActivityEntryDto, { kind: "message" }> {
  return {
    kind: "message",
    id: message.id,
    at: message.sentAt,
    message,
    senderIsMine: true,
    thread: { id: message.messagingThreadId, type: "single", label: "Thread" },
    records: { primary: null, related: [], relatedOverflow: 0 },
  };
}

let root: Root;
let container: HTMLDivElement;

function render(node: ReactNode) {
  act(() => root.render(node));
  return container;
}

function button(label: string): HTMLButtonElement {
  const match = Array.from(container.querySelectorAll("button")).find(
    (node) => node.textContent === label || node.getAttribute("aria-label") === label,
  );
  if (!match) throw new Error(`Missing button: ${label}`);
  return match;
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.messageStatus = {};
  harness.thread = { isOwner: true, accountShared: false };
  harness.timelineEntry = null;
  harness.accounts = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("shared message presentation", () => {
  it("renders drafts with current account settings, matching send HTML, and permits logo opt-in", () => {
    const settings = defaultEmailSettings();
    settings.signature.enabled = true;
    const account = observable({
      id: BASE.connectedAccountId,
      signature: "**Current footer**",
      emailSettings: settings,
    });
    harness.accounts = [account];
    const draft = {
      ...BASE,
      isDraft: true,
      bodyText: "**Draft body**",
      bodyHtml: "<p>Stale saved preview</p>",
      draftRevision: "revision",
    };
    render(createElement(MessageItem, { message: draft, isMine: true, accountOwner: null }));
    const expected = composeEmailBodies(draft.bodyText, account.signature, settings, "markdown").html;
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("Current footer");
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).not.toContain("Stale saved preview");
    expect(expected).not.toContain("-- ");
    expect(button("Inbox.compose.loadRemoteImages").closest("[data-email-header]")).not.toBeNull();
    expect(button("Inbox.compose.loadRemoteImages").closest("[data-message-actions]")).toBeNull();
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("img-src data:;");
    act(() => button("Inbox.compose.loadRemoteImages").click());
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("img-src data: https:;");
    act(() =>
      runInAction(() => {
        account.emailSettings.signature.enabled = false;
      }),
    );
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).not.toContain("Current footer");
  });

  it.each([false, true])("keeps an email surface neutral in either direction (outbound=%s)", (isOutbound) => {
    render(createElement(MessageSurface, { isEmail: true, isOutbound }, createElement("div", {}, "Email")));
    const surface = container.firstElementChild;
    expect(surface?.classList.contains("bg-card")).toBe(true);
    expect(surface?.classList.contains("w-full")).toBe(true);
    expect(surface?.className).not.toMatch(/bg-primary|p-1\.5/);
    expect(surface?.classList.contains(isOutbound ? "rounded-br-md" : "rounded-bl-md")).toBe(true);
  });

  it("keeps email HTML in its sanitized sandbox and remote content opt-in", () => {
    render(
      createElement(MessageBody, {
        message: {
          ...BASE,
          bodyHtml: '<p>Hello</p><script>alert(1)</script><img src="https://example.com/logo.png">',
        },
      }),
    );
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("allow-same-origin");
    expect(frame?.getAttribute("srcdoc")).toContain("img-src data:;");
    expect(frame?.getAttribute("srcdoc")).toContain("<p>Hello</p>");
    expect(frame?.getAttribute("srcdoc")).not.toContain("<script>");
  });

  it.each(["bodyText", "bodyHtml"] as const)(
    "collapses quoted plain email from %s and keeps links functional",
    (field) => {
      render(
        createElement(MessageBody, {
          message: {
            ...BASE,
            bodyHtml: null,
            bodyText: null,
            [field]: "Current https://example.com\n\nOn Monday wrote:\n> Previous",
          },
        }),
      );
      expect(container.textContent).toContain("Current");
      expect(container.textContent).not.toContain("Previous");
      expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
      act(() => button("Inbox.showQuotedText").click());
      expect(container.textContent).toContain("Previous");
      act(() => button("Inbox.hideQuotedText").click());
      expect(container.textContent).not.toContain("Previous");
    },
  );

  it("sanitizes rich chat HTML and renders LinkedIn subjects once", () => {
    render(
      createElement(MessageBody, {
        message: {
          ...BASE,
          provider: "linkedin",
          subject: "InMail subject",
          bodyHtml: '<b>Rich text</b><img onerror="alert(1)"><script>secret</script>',
        },
      }),
    );
    expect(container.textContent).toBe("InMail subjectRich text");
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("b")?.textContent).toBe("Rich text");
    expect(container.innerHTML).not.toContain("onerror");
    expect(container.querySelector("script")).toBeNull();
  });

  it("does not render deleted content, links or remote images", () => {
    render(createElement(MessageBody, { message: { ...BASE, isDeleted: true } }));
    expect(container.textContent).toBe("Inbox.messageDeleted");
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("updates observable chat text and deletion without depending on a parent store", () => {
    const message = observable({
      ...BASE,
      provider: "linkedin" as const,
      subject: null,
      bodyHtml: null,
    });
    render(createElement(MessageBody, { message }));
    expect(container.textContent).toBe("Hello");
    act(() =>
      runInAction(() => {
        message.bodyText = "Edited text";
      }),
    );
    expect(container.textContent).toBe("Edited text");
    act(() =>
      runInAction(() => {
        message.isDeleted = true;
      }),
    );
    expect(container.textContent).toBe("Inbox.messageDeleted");
  });

  it("shows unsupported content only without attachments, reactions or pending files", () => {
    const message = {
      ...BASE,
      bodyHtml: null,
      bodyText: "Unipile cannot display this type of message",
    };
    render(createElement(MessageBody, { message }));
    expect(container.textContent).toBe("Inbox.attachmentUnsupported");
    render(createElement(MessageBody, { message, hasSupplementaryContent: true }));
    expect(container.textContent).toBe("");
  });

  it("does not offer tracking pixels as loadable content", () => {
    expect(hasLoadableRemoteImages('<img src="https://example.com/logo.png" width="80">')).toBe(true);
    expect(hasLoadableRemoteImages('<img src="https://example.com/pixel" width="1" height="1">')).toBe(false);
    expect(hasLoadableRemoteImages('<img src="https://example.com/pixel" style="display:none">')).toBe(false);
    expect(hasLoadableRemoteImages('<img src="data:image/png;base64,abcd">')).toBe(false);
  });
  it("offers explicit loading for a preserved legacy email background", () => {
    const message = {
      ...BASE,
      bodyHtml:
        '<html><head id="authored-head"></head><body title="Background > preview" background="https://example.test/background.png"><p>Authored email</p></body></html>',
    };
    render(createElement(MessageItem, { message, isMine: true, accountOwner: null }));
    expect(container.querySelector("iframe")?.srcdoc).toContain("img-src data:;");
    expect(container.querySelector("iframe")?.srcdoc).not.toContain('background="https://example.test/background.png"');
    act(() => button("Inbox.compose.loadRemoteImages").click());
    expect(container.querySelector("iframe")?.srcdoc).toContain("img-src data: https:;");
    expect(container.querySelector("iframe")?.srcdoc).toContain('background="https://example.test/background.png"');
    expect(container.querySelector("iframe")?.srcdoc).toContain("Authored email");
    expect(hasLoadableRemoteImages('<body background="data:image/png;base64,abcd">')).toBe(false);
  });
});

describe("Inbox and activity consumers", () => {
  it("discloses and copies every recipient without changing the message's folder", () => {
    const person = (id: string, identifier: string) => ({ attendeeId: id, identifier, displayName: null, records: [] });
    const message = {
      ...BASE,
      folderIds: ["inbox"],
      recipients: {
        to: [person("to", "reader@example.test"), person("to-2", "second@example.test")],
        cc: [person("cc", "team@example.test")],
        bcc: [person("bcc", "archive@example.test")],
      },
    };
    render(
      createElement(EmailMessageHeader, {
        senderName: "Sender",
        message,
        folders: [{ id: "inbox", name: "Inbox", role: null, totalCount: null, unreadCount: null }],
      }),
    );
    const disclosure = button("Inbox.messageDetails");
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("archive@example.test");
    act(() => disclosure.click());
    expect(disclosure.getAttribute("aria-expanded")).toBe("true");
    expect(container.textContent).toContain("Inbox.compose.from:");
    expect(container.textContent?.match(/Inbox\.compose\.toLabel:/g)).toHaveLength(1);
    for (const address of ["reader@example.test", "second@example.test", "team@example.test", "archive@example.test"]) {
      expect(container.querySelectorAll(`[aria-label="Inbox.copyAddress:${address}"]`)).toHaveLength(1);
      act(() => button(`Inbox.copyAddress:${address}`).click());
      expect(harness.clipboard).toHaveBeenLastCalledWith(address);
    }
    expect(container.querySelector('[aria-label="Inbox.folders.messageOptions:Inbox"]')).not.toBeNull();
    act(() => disclosure.click());
    expect(disclosure.getAttribute("aria-expanded")).toBe("false");
    expect(container.textContent).not.toContain("archive@example.test");
    expect(container.textContent).not.toContain("second@example.test");
    expect(container.textContent).toContain("reader@example.test");
  });

  it("expands Cc-only email without duplicating Cc or inventing To", () => {
    render(
      createElement(EmailMessageHeader, {
        senderName: "Sender",
        message: {
          ...BASE,
          recipients: {
            to: [],
            cc: [
              { attendeeId: "cc-1", identifier: "first@example.test", displayName: null, records: [] },
              { attendeeId: "cc-2", identifier: "second@example.test", displayName: null, records: [] },
            ],
            bcc: [{ attendeeId: "bcc", identifier: "hidden@example.test", displayName: null, records: [] }],
          },
        },
        folders: [],
      }),
    );
    act(() => button("Inbox.messageDetails").click());
    expect(container.textContent?.match(/Inbox\.compose\.ccLabel:/g)).toHaveLength(1);
    expect(container.textContent).not.toContain("Inbox.compose.toLabel:");
    for (const address of ["first@example.test", "second@example.test", "hidden@example.test"])
      expect(container.querySelectorAll(`[aria-label="Inbox.copyAddress:${address}"]`)).toHaveLength(1);
  });

  it("keeps copying on the addresses without a duplicate menu command", () => {
    render(createElement(EmailMessageHeader, { senderName: "Sender", message: BASE, folders: [] }));
    act(() => {
      button("Inbox.emailActions").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]')).map((item) => item.textContent);
    expect(items).toContain("Inbox.messageDetails");
    expect(items.some((text) => text?.includes("Inbox.copyAddress"))).toBe(false);
  });

  it.each(["inbox", "activity"])("uses the shared neutral email surface in %s", (surface) => {
    render(
      surface === "inbox"
        ? createElement(MessageItem, {
            message: BASE,
            isMine: true,
            accountOwner: null,
          })
        : createElement(MessageDetail, { entry: entry(BASE) }),
    );
    const frame = container.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.closest(".bg-card")).not.toBeNull();
    expect(frame?.closest(".bg-card")?.className).not.toMatch(/bg-primary|p-1\.5/);
  });

  it("allows activity images explicitly and resets permission when another message opens", () => {
    const message = {
      ...BASE,
      bodyHtml: '<p>Body</p><img src="https://example.com/logo.png" width="80">',
    };
    render(createElement(MessageDetail, { entry: entry(message) }));
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("img-src data:;");
    act(() => button("Inbox.compose.loadRemoteImages").click());
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("img-src data: https:;");
    render(
      createElement(MessageDetail, {
        entry: entry({ ...message, id: "other-message" }),
      }),
    );
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("img-src data:;");
  });

  it("does not reveal deleted subjects or attachment names from an activity", () => {
    render(
      createElement(MessageDetail, {
        entry: entry({
          ...BASE,
          isDeleted: true,
          attachmentsMeta: [
            {
              id: "attachment",
              name: "Deleted attachment",
              mime: "text/plain",
            },
          ],
        }),
      }),
    );
    expect(container.textContent).toContain("Inbox.messageDeleted");
    expect(container.textContent).not.toContain("Email subject");
    expect(container.textContent).not.toContain("Deleted attachment");
  });

  it("keeps a fallback for reaction-only activities because this surface does not render reactions", () => {
    render(
      createElement(MessageDetail, {
        entry: entry({
          ...BASE,
          bodyHtml: null,
          bodyText: null,
          reactions: [{ value: "👍" }],
        }),
      }),
    );
    expect(container.textContent).toContain("Inbox.attachmentUnsupported");
  });

  it("does not reveal a deleted subject through the activity modal title", () => {
    harness.timelineEntry = entry({ ...BASE, isDeleted: true });
    render(createElement(TimelineDetailModal));
    expect(container.querySelector("section")?.getAttribute("data-modal-title")).toBe("Inbox.messageDeleted");
    expect(container.innerHTML).not.toContain("Email subject");
  });

  it("preserves Inbox draft actions and recipient/attachment rendering", () => {
    const message = {
      ...BASE,
      isDraft: true,
      draftRevision: "2026-09-05T12:00:00.000Z",
      attachmentsMeta: [{ id: "attachment", name: "Document", mime: "text/plain" }],
    };
    render(createElement(MessageItem, { message, isMine: true, accountOwner: null }));
    expect(container.textContent).toContain("Inbox.compose.toLabel:");
    expect(container.textContent).toContain("recipient@example.com");
    expect(container.querySelector('[data-attachment="attachment"]')).not.toBeNull();
    act(() => button("Inbox.compose.draftEdit").click());
    expect(harness.loadDraft).toHaveBeenCalledWith(message);
    act(() => button("Inbox.compose.draftSendNow").click());
    expect(harness.sendDraft).toHaveBeenCalledExactlyOnceWith(message);
    expect(harness.loadDraft).toHaveBeenCalledOnce();
    expect(harness.send).not.toHaveBeenCalled();
    act(() => button("Common.actions.discard").click());
    expect(harness.discardDraft).toHaveBeenCalledWith(message.id, message.draftRevision);
  });

  it("offers no draft actions to a teammate who only reads a shared conversation", () => {
    harness.thread = { isOwner: false, accountShared: false };
    const message = { ...BASE, isDraft: true, draftRevision: "2026-09-05T12:00:00.000Z" };
    render(createElement(MessageItem, { message, isMine: true, accountOwner: null }));

    for (const label of ["Inbox.compose.draftEdit", "Common.actions.discard"])
      expect(container.querySelector(`button[aria-label="${label}"]`)).toBeNull();
    expect(container.textContent).not.toContain("Inbox.compose.draftSendNow");
  });

  it("preserves Inbox failure styling and retry action", () => {
    harness.messageStatus[BASE.id] = "failed";
    render(
      createElement(MessageItem, {
        message: BASE,
        isMine: true,
        accountOwner: null,
      }),
    );
    expect(container.querySelector("iframe")?.closest(".ring-destructive\\/50")).not.toBeNull();
    act(() => button("Inbox.compose.retry").click());
    expect(harness.retrySend).toHaveBeenCalledWith(BASE.id);
  });

  it("keeps the failure styling but offers no retry when retrying cannot help", () => {
    harness.messageStatus[BASE.id] = "failed";
    harness.canRetry.mockReturnValueOnce(false).mockReturnValueOnce(false);
    render(createElement(MessageItem, { message: BASE, isMine: true, accountOwner: null }));

    expect(container.querySelector("iframe")?.closest(".ring-destructive\\/50")).not.toBeNull();
    expect(container.textContent).not.toContain("Inbox.compose.retry");
  });
});
