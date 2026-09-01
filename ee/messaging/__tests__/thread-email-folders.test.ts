import { describe, expect, it } from "vitest";

import type { EmailFolder } from "../email-folders";

import { isMovableEmailFolder, threadEmailFolderIds } from "../email-folders";

const folder = (id: string, name: string, role: string | null): EmailFolder => ({
  id,
  name,
  role,
  totalCount: null,
  unreadCount: null,
});

const CATALOG: EmailFolder[] = [
  folder("inbox", "INBOX", "INBOX"),
  folder("sent", "Sent Mail", "SENT"),
  folder("drafts", "Drafts", "DRAFTS"),
  folder("archive", "Archive", "ARCHIVE"),
  folder("trash", "Trash", "TRASH"),
  folder("referenz", "Referenz", null),
];

const at = (iso: string) => new Date(iso);

describe("isMovableEmailFolder", () => {
  it("treats ordinary and custom folders as movable targets", () => {
    expect(isMovableEmailFolder(folder("inbox", "INBOX", "INBOX"))).toBe(true);
    expect(isMovableEmailFolder(folder("archive", "Archive", "ARCHIVE"))).toBe(true);
    expect(isMovableEmailFolder(folder("trash", "Trash", "TRASH"))).toBe(true);
    expect(isMovableEmailFolder(folder("referenz", "Referenz", null))).toBe(true);
  });

  it("excludes Sent and Drafts, where filing a received mail makes no sense", () => {
    expect(isMovableEmailFolder(folder("sent", "Sent Mail", "SENT"))).toBe(false);
    expect(isMovableEmailFolder(folder("drafts", "Drafts", "DRAFTS"))).toBe(false);
  });

  it("recognises a localized Sent folder that carries no role", () => {
    expect(isMovableEmailFolder(folder("s2", "Gesendete Elemente", null))).toBe(false);
  });
});

describe("threadEmailFolderIds", () => {
  it("reports the folder of the most recent filed message", () => {
    const messages = [
      { folderIds: ["inbox"], sentAt: at("2026-09-01T10:00:00Z") },
      { folderIds: ["archive"], sentAt: at("2026-09-01T12:00:00Z") },
    ];

    expect(threadEmailFolderIds(messages, CATALOG)).toEqual(["archive"]);
  });

  it("ignores the Sent copy, so a reply does not drag the thread into Sent", () => {
    const messages = [
      { folderIds: ["inbox"], sentAt: at("2026-09-01T10:00:00Z") },
      { folderIds: ["sent"], sentAt: at("2026-09-01T12:00:00Z") },
    ];

    expect(threadEmailFolderIds(messages, CATALOG)).toEqual(["inbox"]);
  });

  it("returns nothing when the thread only exists in Sent or Drafts", () => {
    const messages = [
      { folderIds: ["sent"], sentAt: at("2026-09-01T10:00:00Z") },
      { folderIds: ["drafts"], sentAt: at("2026-09-01T11:00:00Z") },
    ];

    expect(threadEmailFolderIds(messages, CATALOG)).toEqual([]);
  });

  it("keeps multiple labels on one message, as Gmail allows", () => {
    const messages = [{ folderIds: ["referenz", "inbox"], sentAt: at("2026-09-01T10:00:00Z") }];

    expect(threadEmailFolderIds(messages, CATALOG)).toEqual(["inbox", "referenz"]);
  });

  it("drops the Sent label from a message that carries both", () => {
    const messages = [{ folderIds: ["sent", "archive"], sentAt: at("2026-09-01T10:00:00Z") }];

    expect(threadEmailFolderIds(messages, CATALOG)).toEqual(["archive"]);
  });

  it("treats an unknown folder id as movable rather than hiding the thread's location", () => {
    const messages = [{ folderIds: ["not-in-catalog"], sentAt: at("2026-09-01T10:00:00Z") }];

    expect(threadEmailFolderIds(messages, CATALOG)).toEqual(["not-in-catalog"]);
  });

  it("returns nothing for a chat thread, whose messages carry no folders", () => {
    expect(threadEmailFolderIds([{ folderIds: [], sentAt: at("2026-09-01T10:00:00Z") }], CATALOG)).toEqual([]);
    expect(threadEmailFolderIds([], CATALOG)).toEqual([]);
  });
});
