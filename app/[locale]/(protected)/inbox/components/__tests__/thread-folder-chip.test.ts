import type { EmailFolder } from "@/ee/messaging/email-folders";
import type { ReactNode } from "react";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  chipProps: vi.fn(),
  folderContext: null as unknown,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    intlStore: { collator: new Intl.Collator("en") },
    messagingThreadDetailStore: { folderContext: harness.folderContext },
  }),
}));

vi.mock("@/components/chip/app-chip", () => ({
  AppChip: (props: Record<string, unknown> & { children?: ReactNode }) => {
    harness.chipProps(props);
    return createElement("span", { "data-chip": true }, props.children);
  },
}));

const { ThreadFolderChip } = await import("../thread-folder-chip");

const folder = (id: string, name: string | null): EmailFolder => ({
  id,
  name,
  role: null,
  totalCount: null,
  unreadCount: null,
});

function render(context: unknown) {
  harness.folderContext = context;
  return renderToStaticMarkup(createElement(ThreadFolderChip));
}

function chipProps() {
  return harness.chipProps.mock.lastCall?.[0] as Record<string, unknown>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ThreadFolderChip", () => {
  it("renders nothing for a thread with no folder context, such as a chat", () => {
    expect(render(null)).toBe("");
    expect(harness.chipProps).not.toHaveBeenCalled();
  });

  it("names the folder the conversation currently sits in", () => {
    const markup = render({
      currentFolderIds: ["archive"],
      folders: [folder("inbox", "INBOX"), folder("archive", "Archive")],
      selectedFolderIds: ["inbox", "archive"],
    });

    expect(markup).toContain("Archive");
    expect(chipProps().tooltip).toBe("Inbox.folders.current:Archive");
  });

  it("sorts multiple labels so the chip reads the same on every render", () => {
    render({
      currentFolderIds: ["referenz", "inbox"],
      folders: [folder("inbox", "INBOX"), folder("referenz", "Referenz")],
      selectedFolderIds: ["inbox", "referenz"],
    });

    expect(renderToStaticMarkup(createElement(ThreadFolderChip))).toContain("INBOX, Referenz");
  });

  it("warns that the conversation sits outside the visible list", () => {
    render({
      currentFolderIds: ["trash"],
      folders: [folder("inbox", "INBOX"), folder("trash", "Trash")],
      selectedFolderIds: ["inbox"],
    });

    expect(chipProps().tooltip).toBe("Inbox.folders.hiddenTooltip:Trash");
  });

  it("does not warn when only one of several folders is visible", () => {
    render({
      currentFolderIds: ["inbox", "trash"],
      folders: [folder("inbox", "INBOX"), folder("trash", "Trash")],
      selectedFolderIds: ["inbox"],
    });

    expect(chipProps().tooltip).toBe("Inbox.folders.current:INBOX, Trash");
  });

  it("falls back to a readable name rather than exposing a folder id", () => {
    render({
      currentFolderIds: ["6a1f"],
      folders: [folder("6a1f", null)],
      selectedFolderIds: ["6a1f"],
    });

    expect(chipProps().tooltip).toBe("Inbox.folders.current:Common.unnamed");
  });

  it("names an unknown folder id without leaking it, when the catalog is behind", () => {
    render({ currentFolderIds: ["not-in-catalog"], folders: [], selectedFolderIds: ["inbox"] });

    expect(chipProps().tooltip).toBe("Inbox.folders.hiddenTooltip:Common.unnamed");
  });

  it("says so plainly when the conversation is filed nowhere", () => {
    render({ currentFolderIds: [], folders: [folder("inbox", "INBOX")], selectedFolderIds: ["inbox"] });

    expect(chipProps().tooltip).toBe("Inbox.folders.current:Inbox.folders.none");
  });
});
