import { describe, expect, it } from "vitest";

import { canManageThreadDrafts } from "../draft-thread";

describe("canManageThreadDrafts", () => {
  it("lets the account owner edit, send and discard drafts", () => {
    expect(canManageThreadDrafts({ isOwner: true, accountShared: false })).toBe(true);
  });

  it("lets a teammate with access to the whole account manage drafts", () => {
    expect(canManageThreadDrafts({ isOwner: false, accountShared: true })).toBe(true);
  });

  it("offers no draft actions to a teammate who only reads a shared conversation", () => {
    expect(canManageThreadDrafts({ isOwner: false, accountShared: false })).toBe(false);
  });

  it("offers nothing before the conversation has loaded", () => {
    expect(canManageThreadDrafts(null)).toBe(false);
  });
});
