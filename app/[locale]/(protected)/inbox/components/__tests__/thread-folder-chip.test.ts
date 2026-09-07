import type { EmailFolder } from "@/ee/messaging/email-folders";
import type { ReactNode } from "react";

import { Folder } from "lucide-react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  chipProps: vi.fn(),
  folderContext: null as unknown,
  canUpdate: false,
  provider: "mail" as string,
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    intlStore: { collator: new Intl.Collator("en") },
    userStore: { can: () => harness.canUpdate },
    messagingThreadDetailStore: {
      folderContext: harness.folderContext,
      thread: { provider: harness.provider },
      moveToFolder: vi.fn(),
    },
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
  harness.canUpdate = false;
  harness.provider = "mail";
});

function renderAsEditor(context: unknown) {
  harness.canUpdate = true;
  return render(context);
}

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

  it("always shows a folder icon, never swapping it for the hidden state", () => {
    render({ currentFolderIds: ["inbox"], folders: [folder("inbox", "INBOX")], selectedFolderIds: ["inbox"] });
    const whenVisible = chipProps().startContent as { type: unknown };

    render({ currentFolderIds: ["trash"], folders: [folder("trash", "Trash")], selectedFolderIds: ["inbox"] });
    const whenHidden = chipProps().startContent as { type: unknown };

    expect(whenVisible.type).toBe(Folder);
    expect(whenHidden.type).toBe(Folder);
  });

  it("carries the hidden warning on the label, since the icon no longer signals it", () => {
    render({ currentFolderIds: ["trash"], folders: [folder("trash", "Trash")], selectedFolderIds: ["inbox"] });

    expect(chipProps()["aria-label"]).toBe("Inbox.folders.hiddenTooltip:Trash");
    expect(chipProps().tooltip).toBe("Inbox.folders.hiddenTooltip:Trash");
  });
});

describe("ThreadFolderChip move picker", () => {
  const catalog = {
    currentFolderIds: ["inbox"],
    folders: [
      folder("inbox", "INBOX"),
      folder("archive", "Archive"),
      folder("sent", "Sent Mail"),
      { id: "trash", name: "Trash", role: "TRASH", totalCount: null, unreadCount: null },
    ],
    selectedFolderIds: ["inbox"],
  };

  it("stays a read-only chip for someone who cannot update the inbox", () => {
    const markup = render(catalog);

    expect(harness.chipProps).toHaveBeenCalled();
    expect(markup).not.toContain("inbox-thread-folder");
  });

  it("offers a picker to someone who can update the inbox", () => {
    const markup = renderAsEditor(catalog);

    expect(harness.chipProps).not.toHaveBeenCalled();
    expect(markup).toContain("inbox-thread-folder");
  });

  it("keeps the folder explanation on the picker, not only on the read-only chip", () => {
    const markup = renderAsEditor(catalog);

    expect(markup).toContain('aria-label="Inbox.folders.current:INBOX"');
    expect(markup).toContain('title="Inbox.folders.current:INBOX"');
  });

  it("shows a read-only chip on a provider whose mail cannot be filed", () => {
    harness.provider = "google";
    const markup = renderAsEditor(catalog);

    expect(harness.chipProps).toHaveBeenCalled();
    expect(markup).not.toContain("inbox-thread-folder");
  });

  it("treats Sent as unmovable, falling back to the read-only chip when it is the only folder", () => {
    const markup = renderAsEditor({
      currentFolderIds: ["sent"],
      folders: [folder("sent", "Sent Mail")],
      selectedFolderIds: ["sent"],
    });

    expect(harness.chipProps).toHaveBeenCalled();
    expect(markup).not.toContain("inbox-thread-folder");
  });
});
