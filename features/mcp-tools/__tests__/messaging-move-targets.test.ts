import type { ThreadFolderContext } from "@/ee/messaging/inbox/get-messaging-thread.interactor";

import { describe, expect, it, vi } from "vitest";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => MOCK_ENV_MODULE);

import { threadFolder } from "../thread-folder";

const folder = (id: string, name: string, role: string | null) => ({
  id,
  name,
  role,
  totalCount: null,
  unreadCount: null,
});

const context: ThreadFolderContext = {
  currentFolderIds: ["inbox"],
  selectedFolderIds: ["inbox"],
  folders: [
    folder("inbox", "INBOX", "INBOX"),
    folder("archive", "Archive", null),
    folder("sent", "Sent Mail", "SENT"),
    folder("drafts", "Drafts", "DRAFTS"),
    folder("trash", "Trash", "TRASH"),
    folder("junk", "Junk", "SPAM"),
  ],
};

describe("threadFolder move targets offered to an agent", () => {
  it("offers only folders a move may actually land in", () => {
    const names = threadFolder(context, "mail")?.moveTargets.map((entry) => entry.name);

    expect(names).toEqual(["Archive", "INBOX"]);
  });

  it("never offers Trash or Junk, whose relocation hard-deletes the local record", () => {
    const ids = threadFolder(context, "mail")?.moveTargets.map((entry) => entry.id) ?? [];

    expect(ids).not.toContain("trash");
    expect(ids).not.toContain("junk");
  });

  it("never offers Sent or Drafts", () => {
    const ids = threadFolder(context, "mail")?.moveTargets.map((entry) => entry.id) ?? [];

    expect(ids).not.toContain("sent");
    expect(ids).not.toContain("drafts");
  });

  it("offers nothing on a provider whose mail cannot be filed", () => {
    expect(threadFolder(context, "google")?.moveTargets).toEqual([]);
  });

  it("still reports the current folder on a provider that cannot be filed", () => {
    expect(threadFolder(context, "google")?.name).toBe("INBOX");
  });
});
