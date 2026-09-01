import type { EmailFolder } from "@/ee/messaging/email-folders";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    intlStore: { collator: new Intl.Collator("en") },
    messagingThreadDetailStore: {
      folderContext: {
        currentFolderIds: ["inbox"],
        folders: [
          { id: "inbox", name: "INBOX", role: "INBOX", totalCount: null, unreadCount: null } satisfies EmailFolder,
        ],
        selectedFolderIds: ["inbox"],
      },
    },
  }),
}));

const { ThreadFolderChip } = await import("../thread-folder-chip");

describe("ThreadFolderChip layout, through the real AppChip", () => {
  const markup = renderToStaticMarkup(createElement(ThreadFolderChip));
  const classes = (/class="([^"]*)"/.exec(markup)?.[1] ?? "").split(/\s+/);

  it("leaves no horizontal padding or gap behind once the label is hidden", () => {
    expect(classes).toContain("px-0");
    expect(classes).toContain("gap-0");
    expect(classes).not.toContain("px-2");
    expect(classes).not.toContain("gap-1.5");
  });

  it("is a square the size of the neighbouring icon buttons", () => {
    const square = classes.includes("size-8") || (classes.includes("h-8") && classes.includes("w-8"));
    expect(square, `expected a 2rem square, got: ${classes.join(" ")}`).toBe(true);
    expect(classes).not.toContain("w-auto");
  });

  it("restores the padded, auto-width chip from the sm breakpoint up", () => {
    for (const c of ["sm:w-auto", "sm:gap-1.5", "sm:px-2"]) expect(classes).toContain(c);
  });

  it("renders a folder icon", () => {
    expect(markup).toContain("lucide-folder");
    expect(markup).not.toContain("lucide-eye-off");
  });
});
