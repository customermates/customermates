import type { EmailFolder } from "../email-folders";

import { describe, expect, it } from "vitest";

import { emailMoveTargets } from "../email-folders";

const folder = (id: string, name: string, role: string | null): EmailFolder => ({
  id,
  name,
  role,
  totalCount: null,
  unreadCount: null,
});

const CATALOG = [
  folder("inbox", "INBOX", "INBOX"),
  folder("archive", "Archive", "ARCHIVE"),
  folder("sent", "Sent Mail", "SENT"),
  folder("drafts", "Drafts", "DRAFTS"),
  folder("trash", "Trash", "TRASH"),
  folder("junk", "Junk", "SPAM"),
  folder("spam", "Spam", "SPAM"),
];

describe("emailMoveTargets", () => {
  it("offers only folders a conversation may actually be filed into", () => {
    expect(emailMoveTargets(CATALOG, "mail").map((entry) => entry.id)).toEqual(["archive", "inbox"]);
  });

  it("never offers Trash, Junk or Spam, whose relocation hard-deletes the local record", () => {
    const ids = emailMoveTargets(CATALOG, "mail").map((entry) => entry.id);

    for (const excluded of ["trash", "junk", "spam"]) expect(ids).not.toContain(excluded);
  });

  it("never offers Sent or Drafts", () => {
    const ids = emailMoveTargets(CATALOG, "mail").map((entry) => entry.id);

    expect(ids).not.toContain("sent");
    expect(ids).not.toContain("drafts");
  });

  it("offers nothing for Gmail, whose folder write replaces every label", () => {
    expect(emailMoveTargets(CATALOG, "google")).toEqual([]);
  });

  it("offers nothing for a chat provider", () => {
    expect(emailMoveTargets(CATALOG, "whatsapp")).toEqual([]);
  });

  it("recognises a skipped folder by name when the provider reports no role", () => {
    const byName = [folder("a", "Archive", null), folder("t", "Deleted Items", null)];

    expect(emailMoveTargets(byName, "mail").map((entry) => entry.id)).toEqual(["a"]);
  });
});
