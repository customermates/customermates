import { describe, expect, it } from "vitest";

import { resolveWikiPageState, resolveWikiSheetState } from "../wiki-page-state";

const ID = "10000000-0000-4000-8000-000000000001";
const OTHER = "10000000-0000-4000-8000-000000000002";

describe("what the Knowledge Base shows behind the page sheet", () => {
  it.each([
    [{ failed: true, hasPages: true, setupActive: true }, "error"],
    [{ failed: true, hasPages: false, setupActive: false }, "error"],
    [{ failed: false, hasPages: true, setupActive: true }, "content"],
    [{ failed: false, hasPages: true, setupActive: false }, "content"],
    [{ failed: false, hasPages: false, setupActive: true }, "setup"],
    [{ failed: false, hasPages: false, setupActive: false }, "empty"],
  ] as const)("%j shows %s", (input, state) => {
    expect(resolveWikiPageState(input)).toBe(state);
  });
});

describe("what the page sheet shows", () => {
  const closed = { openId: null, loadedId: null, creating: false, awaiting: false, missing: false };

  it("stays closed when no page is asked for", () => {
    expect(resolveWikiSheetState(closed)).toBe("closed");
    expect(resolveWikiSheetState({ ...closed, loadedId: ID })).toBe("closed");
  });

  it("shows a skeleton until the store holds the page that was asked for", () => {
    expect(resolveWikiSheetState({ ...closed, openId: ID })).toBe("loading");
    expect(resolveWikiSheetState({ ...closed, openId: ID, loadedId: OTHER })).toBe("loading");
    expect(resolveWikiSheetState({ ...closed, openId: ID, loadedId: ID })).toBe("page");
  });

  it("says that a page is gone", () => {
    expect(resolveWikiSheetState({ ...closed, openId: ID, missing: true })).toBe("error");
    expect(resolveWikiSheetState({ ...closed, openId: ID, loadedId: ID, missing: true })).toBe("error");
  });

  it("shows a new page whatever the address names", () => {
    expect(resolveWikiSheetState({ ...closed, creating: true })).toBe("page");
    expect(resolveWikiSheetState({ ...closed, creating: true, openId: ID, missing: true })).toBe("page");
  });

  it("keeps a saved page open, and a deleted one closed, until the address has caught up", () => {
    expect(resolveWikiSheetState({ ...closed, awaiting: true, loadedId: ID })).toBe("page");
    expect(resolveWikiSheetState({ ...closed, awaiting: true, loadedId: ID, openId: OTHER })).toBe("page");
    expect(resolveWikiSheetState({ ...closed, awaiting: true, loadedId: null, openId: ID })).toBe("closed");
  });
});
