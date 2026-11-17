import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  search: vi.fn(),
  reported: [] as unknown[],
  workspaceChanged: false,
}));

vi.mock("../../actions", () => ({ searchWikiPagesAction: harness.search }));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: (error: unknown) => harness.reported.push(error),
}));
vi.mock("@/core/errors/workspace-changed-notice", () => ({
  notifyIfWorkspaceChanged: () => harness.workspaceChanged,
}));

import { SEARCH_DEBOUNCE_MS } from "@/core/utils/debounce";

import { WikiSearchStore } from "../wiki-search.store";

const REFUNDS = "10000000-0000-4000-8000-000000000002";
const PRICING = "10000000-0000-4000-8000-000000000003";
const found = (...ids: string[]) => ({ ok: true, data: { items: ids.map((id) => ({ id })) } });

async function settle() {
  await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.search.mockReset().mockResolvedValue(found());
  harness.reported.length = 0;
  harness.workspaceChanged = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("Knowledge Base page search", () => {
  it("keeps what was typed at once and asks the server for the pages whose text has the words a moment later", async () => {
    harness.search.mockResolvedValue(found(REFUNDS, PRICING));
    const store = new WikiSearchStore();

    store.setQuery(" refund window ");
    expect(store.query).toBe(" refund window ");
    expect(store.found.size).toBe(0);
    expect(harness.search).not.toHaveBeenCalled();

    await settle();
    expect(harness.search).toHaveBeenCalledExactlyOnceWith({ query: "refund window", page: 1, pageSize: 25 });
    expect([...store.found]).toEqual([REFUNDS, PRICING]);
  });

  it("asks once for the last of several quick changes", async () => {
    const store = new WikiSearchStore();

    store.setQuery("re");
    store.setQuery("ref");
    store.setQuery("refund");
    await settle();

    expect(harness.search).toHaveBeenCalledExactlyOnceWith({ query: "refund", page: 1, pageSize: 25 });
  });

  it("does not ask for less than two characters and forgets the earlier answer", async () => {
    harness.search.mockResolvedValue(found(REFUNDS));
    const store = new WikiSearchStore();
    store.setQuery("refund");
    await settle();
    expect(store.found.size).toBe(1);

    store.setQuery(" r ");
    expect(store.found.size).toBe(0);
    await settle();
    expect(harness.search).toHaveBeenCalledOnce();

    store.setQuery("");
    await settle();
    expect(harness.search).toHaveBeenCalledOnce();
  });

  it("drops an answer that arrives after the words changed", async () => {
    let answer: (value: unknown) => void = () => {};
    harness.search.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    const store = new WikiSearchStore();
    store.setQuery("refund");
    await settle();

    harness.search.mockResolvedValue(found(PRICING));
    store.setQuery("pricing");
    await settle();
    answer(found(REFUNDS));
    await settle();

    expect([...store.found]).toEqual([PRICING]);
  });

  it("finds nothing by text when the search is refused, and reports a failure without losing the words", async () => {
    const store = new WikiSearchStore();
    harness.search.mockResolvedValue({ ok: false });
    store.setQuery("refund");
    await settle();
    expect(store.found.size).toBe(0);
    expect(harness.reported).toEqual([]);

    const failure = new Error("offline");
    harness.search.mockRejectedValue(failure);
    store.setQuery("refunds");
    await settle();
    expect(harness.reported).toEqual([failure]);
    expect(store.query).toBe("refunds");
  });

  it("leaves a changed workspace to its own notice", async () => {
    harness.workspaceChanged = true;
    harness.search.mockResolvedValue(found(REFUNDS));
    const store = new WikiSearchStore();

    store.setQuery("refund");
    await settle();
    expect(store.found.size).toBe(0);

    harness.search.mockRejectedValue(new Error("workspace changed"));
    store.setQuery("refunds");
    await settle();
    expect(harness.reported).toEqual([]);
  });

  it("asks for nothing and takes no answer once it is disposed", async () => {
    let answer: (value: unknown) => void = () => {};
    const store = new WikiSearchStore();
    store.setQuery("refund");
    store.dispose();
    await settle();
    expect(harness.search).not.toHaveBeenCalled();

    harness.search.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    store.setQuery("pricing");
    await settle();
    store.dispose();
    answer(found(PRICING));
    await settle();
    expect(store.found.size).toBe(0);
  });
});
