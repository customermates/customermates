import type { Root } from "react-dom/client";
import type { WikiPageListResult } from "@/features/wiki/wiki.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ list: vi.fn(), search: vi.fn() }));
vi.mock("../../actions", () => ({ listWikiPagesAction: actions.list, searchWikiPagesAction: actions.search }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: vi.fn() }));

import { useWikiPages } from "../use-wiki-pages";

const initial: WikiPageListResult = { items: [], total: 90, page: 1, pageSize: 25 };
let state: ReturnType<typeof useWikiPages>;
let root: Root;
let container: HTMLElement;
function Harness() {
  state = useWikiPages(initial);
  return null;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  actions.list.mockReset().mockResolvedValue({ ok: true, data: { ...initial, page: 2 } });
  actions.search.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root.render(createElement(Harness)));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

async function search(query: string) {
  act(() => state.search(query));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
}

describe("Wiki navigation search", () => {
  it("uses server-side tenant search instead of filtering the loaded page", async () => {
    actions.search.mockResolvedValue({ ok: true, data: { ...initial, total: 1 } });
    await search("support workflow");
    expect(actions.search).toHaveBeenCalledExactlyOnceWith({ query: "support workflow", page: 1, pageSize: 25 });
    expect(state.result.total).toBe(1);
    expect(state.loading).toBe(false);
  });

  it("ignores outdated results after a new search has started", async () => {
    let oldResult!: (value: unknown) => void;
    actions.search.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          oldResult = resolve;
        }),
    );
    actions.search.mockResolvedValueOnce({ ok: true, data: { ...initial, total: 2 } });
    await search("old");
    await search("new");
    await act(async () => {
      oldResult({ ok: true, data: { ...initial, total: 50 } });
      await Promise.resolve();
    });
    expect(state.result.total).toBe(2);
  });

  it("paginates server-side and returns to the original list when search clears", async () => {
    await act(async () => {
      state.setPage(2);
      await Promise.resolve();
    });
    expect(actions.list).toHaveBeenCalledWith({ page: 2, pageSize: 25 });
    actions.search.mockResolvedValue({ ok: true, data: { ...initial, total: 1 } });
    await search("voice");
    expect(state.page).toBe(1);
    await search("");
    expect(state.result).toBe(initial);
  });

  it("shows failures and retries without losing the query", async () => {
    actions.search.mockResolvedValueOnce({ ok: false, error: { errors: ["Unavailable"] } });
    await search("voice");
    expect(state.failed).toBe(true);
    actions.search.mockResolvedValueOnce({ ok: true, data: { ...initial, total: 1 } });
    await act(async () => {
      state.retry();
      await Promise.resolve();
    });
    expect(state.failed).toBe(false);
    expect(state.query).toBe("voice");
  });
});
