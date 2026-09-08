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
  it("offers every folder a conversation may be filed into, ordered by name", () => {
    expect(emailMoveTargets(CATALOG, "mail").map((entry) => entry.id)).toEqual([
      "archive",
      "inbox",
      "junk",
      "spam",
      "trash",
    ]);
  });

  it("offers Trash, Junk and Spam, which people file into deliberately", () => {
    const ids = emailMoveTargets(CATALOG, "mail").map((entry) => entry.id);

    for (const target of ["trash", "junk", "spam"]) expect(ids).toContain(target);
  });

  it("offers a custom folder whose name merely reads like a system one", () => {
    const custom = [folder("a", "Archive", "ARCHIVE"), folder("d", "Deleted projects", null)];

    expect(emailMoveTargets(custom, "mail").map((entry) => entry.id)).toContain("d");
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

  it("still refuses Sent and Drafts by role", () => {
    const ids = emailMoveTargets(CATALOG, "mail").map((entry) => entry.id);

    expect(ids).not.toContain("sent");
    expect(ids).not.toContain("drafts");
  });
});
