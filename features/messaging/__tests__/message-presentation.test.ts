import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { ActivityEntryDto } from "@/ee/messaging/activities/activities.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  loadDraft: vi.fn(),
  discardDraft: vi.fn(),
  send: vi.fn(),
  retrySend: vi.fn(),
  messageStatus: {} as Record<string, string>,
  timelineEntry: null as ActivityEntryDto | null,
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    messagingThreadDetailStore: { messageStatus: harness.messageStatus },
    threadComposeStore: { ...harness, draftAttachments: [], pendingAttachments: {} },
    threadParticipantsStore: { setOpen: vi.fn() },
    connectedAccountsStore: { items: [] },
    timelineDetailModalStore: {
      isOpen: true,
      form: { entry: harness.timelineEntry, customColumns: [] },
      close: vi.fn(),
    },
  }),
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatNumericalShortDateTime: () => "Date", formatTime: () => "Time" }),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (action: () => unknown) => action(),
}));
vi.mock("@/components/modal", () => ({
  AppModal: ({ children, title }: { children: ReactNode; title: string }) =>
    createElement("section", { "data-modal-title": title }, children),
}));
vi.mock("@/components/ui/avatar", () => ({ Avatar: () => createElement("span", { "data-avatar": true }) }));
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
import { MessageDetail, TimelineDetailModal } from "../activities/activities-detail-modal";
import { hasLoadableRemoteImages, MessageBody } from "../message-body";
import { MessageSurface } from "../message-surface";

const BASE: MessagingMessageDto = {
  id: "00000000-0000-4000-8000-000000000001",
  connectedAccountId: "00000000-0000-4000-8000-000000000003",
  messagingThreadId: "00000000-0000-4000-8000-000000000004",
  provider: "google",
  direction: "outbound",
  sender: { attendeeId: "sender", identifier: "sender@example.com", displayName: "Sender", isSelf: true },
  recipients: {
    to: [{ attendeeId: "recipient", identifier: "recipient@example.com", displayName: "Recipient" }],
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
  harness.timelineEntry = null;
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
        message: { ...BASE, bodyHtml: '<p>Hello</p><script>alert(1)</script><img src="https://example.com/logo.png">' },
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
    const message = observable({ ...BASE, provider: "linkedin" as const, subject: null, bodyHtml: null });
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
    const message = { ...BASE, bodyHtml: null, bodyText: "Unipile cannot display this type of message" };
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
});

describe("Inbox and activity consumers", () => {
  it.each(["inbox", "activity"])("uses the shared neutral email surface in %s", (surface) => {
    render(
      surface === "inbox"
        ? createElement(MessageItem, { message: BASE, isMine: true, accountOwner: null })
        : createElement(MessageDetail, { entry: entry(BASE) }),
    );
    const frame = container.querySelector("iframe");
    expect(frame).not.toBeNull();
    expect(frame?.parentElement?.classList.contains("bg-card")).toBe(true);
    expect(frame?.parentElement?.className).not.toMatch(/bg-primary|p-1\.5/);
  });

  it("allows activity images explicitly and resets permission when another message opens", () => {
    const message = { ...BASE, bodyHtml: '<p>Body</p><img src="https://example.com/logo.png" width="80">' };
    render(createElement(MessageDetail, { entry: entry(message) }));
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("img-src data:;");
    act(() => button("Inbox.compose.loadRemoteImages").click());
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("img-src data: https:;");
    render(createElement(MessageDetail, { entry: entry({ ...message, id: "other-message" }) }));
    expect(container.querySelector("iframe")?.getAttribute("srcdoc")).toContain("img-src data:;");
  });

  it("does not reveal deleted subjects or attachment names from an activity", () => {
    render(
      createElement(MessageDetail, {
        entry: entry({
          ...BASE,
          isDeleted: true,
          attachmentsMeta: [{ id: "attachment", name: "Deleted attachment", mime: "text/plain" }],
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
        entry: entry({ ...BASE, bodyHtml: null, bodyText: null, reactions: [{ value: "👍" }] }),
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
    expect(container.textContent).toContain("recipient@example.com");
    expect(container.querySelector('[data-attachment="attachment"]')).not.toBeNull();
    act(() => button("Inbox.compose.draftEdit").click());
    expect(harness.loadDraft).toHaveBeenCalledWith(message);
    act(() => button("Inbox.compose.draftSendNow").click());
    expect(harness.send).toHaveBeenCalledOnce();
    act(() => button("Inbox.compose.draftDiscard").click());
    expect(harness.discardDraft).toHaveBeenCalledWith(message.id, message.draftRevision);
  });

  it("preserves Inbox failure styling and retry action", () => {
    harness.messageStatus[BASE.id] = "failed";
    render(createElement(MessageItem, { message: BASE, isMine: true, accountOwner: null }));
    expect(container.querySelector("iframe")?.parentElement?.classList.contains("ring-destructive/50")).toBe(true);
    act(() => button("Inbox.compose.retry").click());
    expect(harness.retrySend).toHaveBeenCalledWith(BASE.id);
  });
});
