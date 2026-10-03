import type { EmailFolder } from "@/ee/messaging/email-folders";
import type { MessagingMessageDto } from "@/ee/messaging/inbox/inbox.schema";
import type { ReactNode } from "react";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const clipboard = vi.hoisted(() => vi.fn());

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    collator: new Intl.Collator("en"),
    formatTime: () => "09:30",
    formatNumericalShortDateTime: () => "30/09/2026 09:30",
    formatNumber: (value: number) => String(value),
  }),
}));
vi.mock("@/core/utils/use-copy-to-clipboard", () => ({ useCopyToClipboard: () => clipboard }));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => children,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  TooltipTrigger: ({ children }: { children: ReactNode }) => children,
  TooltipContent: () => null,
}));

import { EmailMessageHeader } from "../email-message-header";

const folder = (id: string, name: string | null): EmailFolder => ({
  id,
  name,
  role: null,
  totalCount: null,
  unreadCount: null,
});
const folders = [
  folder("inbox", "Inbox"),
  folder("sent", "Sent"),
  folder("archive", "Archive"),
  folder("work", "Work"),
];

function render(folderIds: string[] | undefined, extra: Partial<MessagingMessageDto> = {}) {
  const message = {
    folderIds,
    sentAt: new Date("2026-09-30T09:30:00Z"),
    editedAt: null,
    isDeleted: false,
    direction: "outbound",
    recipients: { to: [], cc: [], bcc: [] },
    sender: { identifier: "alex@example.test" },
    provider: "outlook",
    ...extra,
  } as MessagingMessageDto;
  return renderToStaticMarkup(createElement(EmailMessageHeader, { senderName: "Alex Example", message, folders }));
}

describe("Email message metadata and location controls", () => {
  it("shows each email's actual folder, including Sent and Archive in the same conversation", () => {
    for (const [id, name] of [
      ["inbox", "Inbox"],
      ["sent", "Sent"],
      ["archive", "Archive"],
    ]) {
      const html = render([id]);
      expect(html).toContain(`>${name}</span>`);
      expect(html).toContain("Alex Example");
      expect(html).toContain("09:30");
      expect(html).toContain('dateTime="2026-09-30T09:30:00.000Z"');
    }
  });

  it("deduplicates and sorts multiple labels without inferring a single thread location", () => {
    const html = render(["work", "inbox", "work"]);

    expect(html).toContain('aria-label="Inbox.folders.messageOptions:Inbox, Work"');
    expect(html).toContain("+1");
  });

  it("never displays a provider identifier when a folder is missing or unnamed", () => {
    const html = render(["private-provider-identifier"]);

    expect(html).toContain("Common.unnamed");
    expect(html).not.toContain("private-provider-identifier");
  });

  it("keeps the header usable before pending messages or older payloads have folder information", () => {
    for (const ids of [undefined, []]) {
      const html = render(ids);
      expect(html).toContain("Alex Example");
      expect(html).not.toContain("Inbox.folders.messageOptions");
      expect(html).not.toContain("Inbox.folders.none");
    }
  });

  it("keeps the first recipient and folder visible while extra recipients wait for disclosure", () => {
    const html = render(["inbox"], {
      bodyHtml: null,
      recipients: {
        to: [{ attendeeId: "a", identifier: "reader@example.test", displayName: "Reader", isSelf: false }],
        cc: [{ attendeeId: "cc", identifier: "team@example.test", displayName: "Team" }],
        bcc: [{ attendeeId: "bcc", identifier: "archive@example.test", displayName: "Archive" }],
      },
    });

    expect(html).toContain('aria-label="Inbox.copyAddress:reader@example.test"');
    expect(html).not.toContain("team@example.test");
    expect(html).not.toContain("archive@example.test");
    expect(html).toContain("Common.details");
    expect(html).toContain("+2");
    expect(html).toContain('aria-label="Inbox.messageDetails"');
    expect(html).toContain("Inbox.compose.toLabel");
    expect(html).toContain('aria-label="Inbox.folders.messageOptions:Inbox"');
  });

  it("handles Cc-only mail and nameless pending recipients without inventing To addresses", () => {
    const html = render([], {
      recipients: {
        to: [{ attendeeId: "empty", identifier: "", displayName: null }],
        cc: [{ attendeeId: "cc", identifier: "team@example.test", displayName: null }],
        bcc: [],
      },
    });
    expect(html).toContain("Inbox.compose.ccLabel:");
    expect(html).toContain("team@example.test");
    expect(html).not.toContain("Inbox.compose.toLabel:");
    expect(html).not.toContain("+1");
  });

  it("never includes inbound Bcc addresses in the collapsed recipient count", () => {
    const html = render([], {
      direction: "inbound",
      recipients: {
        to: [{ attendeeId: "to", identifier: "reader@example.test", displayName: null }],
        cc: [],
        bcc: [{ attendeeId: "bcc", identifier: "private@example.test", displayName: null }],
      },
    });
    expect(html).not.toContain("private@example.test");
    expect(html).not.toContain("+1");
  });

  it("shows Bcc-only outbound mail without inventing a To row", () => {
    const html = render([], {
      recipients: {
        to: [],
        cc: [],
        bcc: [{ attendeeId: "bcc", identifier: "private@example.test", displayName: null }],
      },
    });
    expect(html).toContain("Inbox.compose.bccLabel:");
    expect(html).not.toContain("Inbox.compose.toLabel:");
  });

  it("expands From, To, Cc and Bcc exactly once while keeping recipients vertically aligned", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      const message = {
        sentAt: new Date("2026-09-30T09:30:00Z"),
        direction: "outbound",
        sender: { identifier: "sender@example.test" },
        recipients: {
          to: [{ identifier: "reader@example.test" }, { identifier: "other@example.test" }],
          cc: [{ identifier: "copy@example.test" }],
          bcc: [{ identifier: "private@example.test" }],
        },
      } as MessagingMessageDto;
      act(() => {
        root.render(createElement(EmailMessageHeader, { message, senderName: "Sender", folders: [] }));
      });
      const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="Inbox.messageDetails"]');
      expect(toggle).not.toBeNull();
      act(() => {
        toggle?.click();
      });
      const labels = [...container.querySelectorAll("span")]
        .map((node) => node.textContent)
        .filter((label) => /^Inbox\.compose\..*:$/.test(label ?? ""));
      expect(labels).toEqual([
        "Inbox.compose.from:",
        "Inbox.compose.toLabel:",
        "Inbox.compose.ccLabel:",
        "Inbox.compose.bccLabel:",
      ]);
      expect(container.querySelectorAll('[aria-label="Inbox.copyAddress:reader@example.test"]')).toHaveLength(1);
      expect(container.querySelectorAll('[aria-label="Inbox.copyAddress:other@example.test"]')).toHaveLength(1);
      act(() => {
        toggle?.click();
      });
      expect(container.textContent).not.toContain("copy@example.test");
      expect(container.textContent).not.toContain("private@example.test");
    } finally {
      act(() => {
        root.unmount();
      });
      container.remove();
      vi.unstubAllGlobals();
    }
  });

  it("keeps deleted email recipients and contextual actions hidden", () => {
    const html = render(["inbox"], {
      isDeleted: true,
      recipients: {
        to: [{ attendeeId: "to", identifier: "hidden@example.test", displayName: null }],
        cc: [],
        bcc: [],
      },
    });
    expect(html).not.toContain("hidden@example.test");
    expect(html).not.toContain("Inbox.emailActions");
  });
});
