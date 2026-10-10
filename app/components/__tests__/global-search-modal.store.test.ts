import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observable, runInAction } from "mobx";
import { recordSearchHit } from "@/tests/helpers/record-search";
import type { RecordSearchResult } from "@/features/records/record-search.schema";

vi.mock("@/app/[locale]/(protected)/search/actions", () => ({
  resolveSearchReferencesAction: vi.fn(),
  globalSearchAction: vi.fn(),
  commandCatalogAction: vi.fn(),
  commandSearchAction: vi.fn(),
  resolveCommandAction: vi.fn(),
}));
import {
  commandCatalogAction,
  commandSearchAction,
  globalSearchAction,
  resolveCommandAction,
  resolveSearchReferencesAction,
} from "@/app/[locale]/(protected)/search/actions";
import { GlobalSearchModalStore } from "../global-search-modal.store";

const TYPE = "10000000-0000-4000-8000-000000000001";
const SECOND_TYPE = "20000000-0000-4000-8000-000000000001";
const ID = "30000000-0000-4000-8000-000000000001";
const FIRST_KEY = "customermates:globalSearch:recent:v3:company-1:user-1";
const SECOND_KEY = "customermates:globalSearch:recent:v3:company-1:user-2";
const hit = recordSearchHit(TYPE, ID, "Current name");
const page = (results = [hit], nextCursor: RecordSearchResult["nextCursor"] = null) => ({
  ok: true as const,
  data: { results, nextCursor, schemaRevision: 1 },
});
const combined = (records = page(), semantic: { key: string; similarity: number }[] = []) => ({
  ok: true as const,
  data: { records: records.data, semantic, docs: [], degraded: false },
});

function browser(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  return values;
}
function setup() {
  const userStore = observable({ user: { id: "user-1", companyId: "company-1" } });
  const store = new GlobalSearchModalStore({
    userStore,
    localeStore: { getTranslation: (key: string) => key, locale: "en" },
    registerModalStore: vi.fn(),
  } as never);
  return { store, userStore };
}
function deferred<T>() {
  let finish: (value: T) => void = () => {
    throw new Error("Missing resolver");
  };
  const promise = new Promise<T>((resolve) => {
    finish = resolve;
  });
  return { promise, finish };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(resolveSearchReferencesAction).mockResolvedValue({ ok: true, data: { results: [] } });
  vi.mocked(commandCatalogAction).mockResolvedValue({
    ok: true,
    data: { schemaRevision: 1, views: [{ typeId: TYPE, id: "view-1", name: "Open" }], fields: [] },
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("generic search state and recent references", () => {
  it("resolves stored references before showing labels and persists only stable references", async () => {
    const values = browser({
      [FIRST_KEY]: [hit.ref, { type: "contact", id: ID }],
      [SECOND_KEY]: [{ typeId: SECOND_TYPE, recordId: ID }],
    });
    const { store } = setup();
    const pending = deferred<Awaited<ReturnType<typeof resolveSearchReferencesAction>>>();
    vi.mocked(resolveSearchReferencesAction).mockReturnValueOnce(pending.promise);
    store.open();
    expect(store.recentItems).toEqual([]);
    expect(resolveSearchReferencesAction).toHaveBeenCalledWith({ refs: [hit.ref] });
    pending.finish({ ok: true, data: { results: [hit] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.recentItems).toEqual([hit]);
    expect(JSON.parse(values.get(FIRST_KEY) ?? "null")).toEqual([hit.ref]);
    expect(values.get(SECOND_KEY)).toContain(SECOND_TYPE);
    expect(values.get(FIRST_KEY)).not.toContain("Current name");
  });
  it("ignores delayed recent names after the active user changes", async () => {
    browser({ [FIRST_KEY]: [hit.ref] });
    const { store, userStore } = setup();
    const pending = deferred<Awaited<ReturnType<typeof resolveSearchReferencesAction>>>();
    vi.mocked(resolveSearchReferencesAction).mockReturnValueOnce(pending.promise);
    store.open();
    runInAction(() => {
      userStore.user = { id: "user-2", companyId: "company-1" };
    });
    pending.finish({ ok: true, data: { results: [hit] } });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.recentItems).toEqual([]);
  });
  it("stores a selected reference even when the modal closes while it is being resolved", async () => {
    const values = browser();
    const { store } = setup();
    store.open();
    await vi.advanceTimersByTimeAsync(0);
    vi.mocked(resolveSearchReferencesAction).mockResolvedValueOnce({ ok: true, data: { results: [hit] } });
    store.pushRecentItem(hit);
    store.close();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(values.get(FIRST_KEY) ?? "null")).toEqual([hit.ref]);
    store.clearRecentItems();
    expect(values.get(FIRST_KEY)).toBe("[]");
  });
  it("drops only the inaccessible reference when records of two types share an ID", async () => {
    const other = recordSearchHit(SECOND_TYPE, ID, "Other type");
    const values = browser({ [FIRST_KEY]: [hit.ref, other.ref] });
    const { store } = setup();
    store.setRecentItems([hit, other]);
    expect(await store.verifyRecentItem(hit)).toBe(false);
    expect(store.recentItems).toEqual([other]);
    expect(JSON.parse(values.get(FIRST_KEY) ?? "null")).toEqual([other.ref]);
  });
  it("rejects stale results while typing a new query and after closing or switching user", async () => {
    browser();
    const { store, userStore } = setup();
    const pending = deferred<Awaited<ReturnType<typeof commandSearchAction>>>();
    vi.mocked(commandSearchAction).mockReturnValueOnce(pending.promise);
    store.open();
    store.onChange("searchTerm", "old");
    await vi.advanceTimersByTimeAsync(250);
    store.onChange("searchTerm", "new");
    pending.finish(combined());
    await vi.advanceTimersByTimeAsync(0);
    expect(store.results).toBeNull();
    const next = deferred<Awaited<ReturnType<typeof commandSearchAction>>>();
    vi.mocked(commandSearchAction).mockReturnValueOnce(next.promise);
    await vi.advanceTimersByTimeAsync(250);
    runInAction(() => {
      userStore.user = { id: "user-2", companyId: "company-1" };
    });
    next.finish(combined());
    await vi.advanceTimersByTimeAsync(0);
    expect(store.results).toBeNull();
    const closing = deferred<Awaited<ReturnType<typeof commandSearchAction>>>();
    vi.mocked(commandSearchAction).mockReturnValueOnce(closing.promise);
    store.onChange("searchTerm", "closing");
    await vi.advanceTimersByTimeAsync(250);
    store.close();
    closing.finish(combined());
    await vi.advanceTimersByTimeAsync(0);
    expect(store.results).toBeNull();
  });
  it("appends cursor pages once and keeps both types when their record UUID is equal", async () => {
    browser();
    const { store } = setup();
    const cursor = { revision: 1, createdAt: "2026-09-28T10:00:00.000000Z", ref: hit.ref };
    vi.mocked(commandSearchAction).mockResolvedValueOnce(combined(page([hit], cursor)));
    store.open();
    store.onChange("searchTerm", "title");
    await vi.advanceTimersByTimeAsync(250);
    const other = recordSearchHit(SECOND_TYPE, ID, "Other type");
    vi.mocked(globalSearchAction).mockResolvedValueOnce(page([hit, other]));
    await store.loadMore();
    expect(globalSearchAction).toHaveBeenLastCalledWith({ searchTerm: "title", limit: 40, cursor });
    expect(store.results?.results).toEqual([hit, other]);
    await store.loadMore();
    expect(globalSearchAction).toHaveBeenCalledTimes(1);
  });
});

describe("command palette state", () => {
  it("loads the names catalog when it opens", async () => {
    browser();
    const { store } = setup();
    store.open();
    await vi.runAllTimersAsync();
    expect(commandCatalogAction).toHaveBeenCalledOnce();
    expect(store.catalog?.views).toEqual([{ typeId: TYPE, id: "view-1", name: "Open" }]);
  });

  it("remembers recent commands by stable id per person", () => {
    const values = browser();
    const { store } = setup();
    store.pushRecentCommand("cmd:page.dashboard");
    store.pushRecentCommand("list:deals");
    store.pushRecentCommand("cmd:page.dashboard");
    expect(store.recentCommandKeys).toEqual(["cmd:page.dashboard", "list:deals"]);
    expect(JSON.parse(values.get("customermates:commandPalette:recent:v1:company-1:user-1") ?? "[]")).toEqual([
      "cmd:page.dashboard",
      "list:deals",
    ]);
  });

  it("steps into and back out of a second level with an empty input", () => {
    browser();
    const { store } = setup();
    store.open();
    store.onChange("searchTerm", "chan");
    store.pushLevel({ kind: "assign", label: "Assign to" });
    expect(store.level).toEqual({ kind: "assign", label: "Assign to" });
    expect(store.form.searchTerm).toBe("");
    store.popLevel();
    expect(store.level).toBeNull();
    store.pushLevel({ kind: "assign", label: "Assign to" });
    store.close();
    store.open();
    expect(store.level).toBeNull();
  });

  it("sends one combined request per settled query with the scope and keeps semantic hits", async () => {
    browser();
    vi.mocked(commandSearchAction).mockResolvedValue(
      combined(page(), [{ key: "cmd:page.dashboard", similarity: 0.8 }]),
    );
    const { store } = setup();
    store.open();
    store.onChange("searchTerm", "r acme");
    await vi.advanceTimersByTimeAsync(200);
    expect(commandSearchAction).toHaveBeenLastCalledWith({
      searchTerm: "acme",
      scope: "records",
      locale: "en",
      semantic: true,
    });
    store.onChange("searchTerm", "s theme");
    expect(store.semantic).toEqual([]);
    await vi.advanceTimersByTimeAsync(200);
    expect(commandSearchAction).toHaveBeenLastCalledWith({
      searchTerm: "theme",
      scope: "settings",
      locale: "en",
      semantic: true,
    });
    expect(store.semantic).toEqual([{ key: "cmd:page.dashboard", similarity: 0.8 }]);
    expect(commandSearchAction).toHaveBeenCalledTimes(2);
  });

  it("asks the server not to embed when the instant matcher is already confident", async () => {
    browser();
    vi.mocked(commandSearchAction).mockResolvedValue(combined());
    const { store } = setup();
    store.setInstantMatcher((query) => query === "dashboard");
    store.open();
    store.onChange("searchTerm", "dashboard");
    await vi.advanceTimersByTimeAsync(200);
    expect(commandSearchAction).toHaveBeenLastCalledWith(expect.objectContaining({ semantic: false }));
    store.onChange("searchTerm", "hot leads");
    await vi.advanceTimersByTimeAsync(200);
    expect(commandSearchAction).toHaveBeenLastCalledWith(expect.objectContaining({ semantic: true }));
  });

  it("resolves a request only for the query and palette session it was asked for", async () => {
    browser();
    const { store } = setup();
    store.open();
    store.onChange("searchTerm", "open my overview");
    vi.mocked(resolveCommandAction).mockResolvedValueOnce({
      ok: true,
      data: { kind: "command", key: "cmd:page.dashboard" },
    });
    expect(await store.resolveCommand("open my overview")).toEqual({
      status: "resolved",
      resolution: { kind: "command", key: "cmd:page.dashboard" },
    });
    expect(resolveCommandAction).toHaveBeenLastCalledWith({ query: "open my overview", locale: "en" });

    const changed = deferred<Awaited<ReturnType<typeof resolveCommandAction>>>();
    vi.mocked(resolveCommandAction).mockReturnValueOnce(changed.promise);
    const typedOn = store.resolveCommand("open my overview");
    store.onChange("searchTerm", "open my overview please");
    expect(store.resolving).toBe(false);
    changed.finish({ ok: true, data: { kind: "command", key: "cmd:page.dashboard" } });
    expect(await typedOn).toEqual({ status: "stale" });

    const reopened = deferred<Awaited<ReturnType<typeof resolveCommandAction>>>();
    vi.mocked(resolveCommandAction).mockReturnValueOnce(reopened.promise);
    store.onChange("searchTerm", "open my overview");
    const acrossSessions = store.resolveCommand("open my overview");
    store.close();
    store.open();
    store.onChange("searchTerm", "open my overview");
    reopened.finish({ ok: true, data: { kind: "command", key: "cmd:page.dashboard" } });
    expect(await acrossSessions).toEqual({ status: "stale" });
  });

  it("reports missing credits as one notice instead of a fallback and can be cancelled", async () => {
    browser();
    const { store } = setup();
    store.open();
    store.onChange("searchTerm", "deals over 10k");
    vi.mocked(resolveCommandAction).mockResolvedValueOnce({ ok: false, error: {}, code: "agentLimitReached" } as never);
    expect(await store.resolveCommand("deals over 10k")).toEqual({ status: "unavailable" });
    expect(store.resolveNotice).toBe("credits");
    vi.mocked(resolveCommandAction).mockResolvedValueOnce({
      ok: false,
      error: {},
      code: "agentServiceUnavailable",
    } as never);
    expect(await store.resolveCommand("deals over 10k")).toEqual({ status: "unavailable" });
    expect(store.resolveNotice).toBe("service");

    const pending = deferred<Awaited<ReturnType<typeof resolveCommandAction>>>();
    vi.mocked(resolveCommandAction).mockReturnValueOnce(pending.promise);
    const cancelled = store.resolveCommand("deals over 10k");
    expect(store.resolving).toBe(true);
    store.cancelResolve();
    expect(store.resolving).toBe(false);
    expect(store.resolveNotice).toBeNull();
    pending.finish({ ok: true, data: { kind: "none" } });
    expect(await cancelled).toEqual({ status: "stale" });
  });
});
