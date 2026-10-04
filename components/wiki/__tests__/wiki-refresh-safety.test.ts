import { act, createElement, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NavigationGuardController } from "@/core/stores/navigation-guard.controller";
import type { RootStore } from "@/core/stores/root.store";
import { WikiPageStore } from "@/app/[locale]/(protected)/wiki/components/wiki-page.store";

const harness = vi.hoisted(() => ({
  refresh: vi.fn(),
  getState: vi.fn(),
  report: vi.fn(),
  rootStore: {} as Record<string, unknown>,
}));
vi.mock("@/core/errors/report-application-error", () => ({
  reportApplicationError: harness.report,
  runUserAction: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: harness.refresh }) }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/app/[locale]/(protected)/wiki/actions", () => ({
  getWikiHomepageSetupStateAction: harness.getState,
  startWikiHomepageSetupAction: vi.fn(),
  createWikiPagesAction: vi.fn(),
  deleteWikiPageAction: vi.fn(),
  getWikiPageAction: vi.fn(),
  updateWikiPageAction: vi.fn(),
}));
vi.mock("@/components/editor/editor.utils", () => ({
  parseMarkdownToJSON: (markdown: string) => ({ markdown }),
  serializeJSONToMarkdown: () => "",
}));

import { useLiveWikiSetupState } from "../wiki-homepage-setup";

const workingState = {
  status: "working" as const,
  homepage: "https://example.com/",
  domain: "example.com",
  pages: [],
};

const rendered: { status: string; fetched?: number }[] = [];
let mounts = 0;

function Poller({ working }: { working: boolean }) {
  const state = useLiveWikiSetupState(working ? workingState : { ...workingState, status: "completed" });
  useEffect(() => {
    mounts += 1;
  }, []);
  rendered.push({ status: state.status, fetched: state.progress?.fetched });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  rendered.length = 0;
  mounts = 0;
  harness.getState.mockResolvedValue({
    ok: true,
    data: { ...workingState, pageCount: 1, progress: { fetched: 1, total: 2 } },
  });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Wiki polling safety", () => {
  it("updates crawl progress in client state without refreshing the route or remounting", async () => {
    harness.rootStore = { navigationGuard: new NavigationGuardController() };
    harness.getState.mockResolvedValue({ ok: true, data: { ...workingState, progress: { fetched: 1, total: 3 } } });
    const root = createRoot(document.createElement("div"));
    try {
      act(() => root.render(createElement(Poller, { working: true })));
      await act(() => vi.advanceTimersByTimeAsync(2500));
      expect(rendered.at(-1)).toEqual({ status: "working", fetched: 1 });
      harness.getState.mockResolvedValue({
        ok: true,
        data: {
          ...workingState,
          progress: { fetched: 2, total: 3, currentUrl: "https://example.com/about" },
        },
      });
      await act(() => vi.advanceTimersByTimeAsync(2500));
      expect(rendered.at(-1)).toEqual({ status: "working", fetched: 2 });
      const renders = rendered.length;
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(rendered).toHaveLength(renders);
      expect(harness.refresh).not.toHaveBeenCalled();
      expect(mounts).toBe(1);
    } finally {
      act(() => root.unmount());
    }
  });

  it("refreshes once when a poll sees the import finish, even after polling stops behind a dirty form", async () => {
    const navigationGuard = new NavigationGuardController();
    harness.rootStore = { navigationGuard };
    const store = new WikiPageStore(
      harness.rootStore as unknown as RootStore,
      {
        id: "10000000-0000-4000-8000-000000000001",
        title: "Saved",
        markdown: "Body",
        kind: "knowledge",
        whenToUse: null,

        createdAt: new Date("2026-09-29"),
        updatedAt: new Date("2026-09-29"),
      },
      vi.fn(),
    );
    navigationGuard.register(store);
    store.onChange("title", "Unsaved title");
    harness.getState.mockResolvedValue({ ok: true, data: { ...workingState, status: "completed" } });
    const root = createRoot(document.createElement("div"));
    try {
      act(() => root.render(createElement(Poller, { working: true })));
      await act(() => vi.advanceTimersByTimeAsync(2500));
      expect(rendered.at(-1)?.status).toBe("completed");
      expect(harness.refresh).not.toHaveBeenCalled();
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(harness.getState).toHaveBeenCalledOnce();
      store.resetDocument();
      expect(harness.refresh).toHaveBeenCalledOnce();
    } finally {
      act(() => root.unmount());
      navigationGuard.unregister(store);
    }
  });

  it("refreshes for growing saved-page totals after the five summaries are unchanged", async () => {
    harness.rootStore = { navigationGuard: new NavigationGuardController() };
    harness.getState.mockResolvedValue({ ok: true, data: { ...workingState, pageCount: 6 } });
    const root = createRoot(document.createElement("div"));
    try {
      act(() => root.render(createElement(Poller, { working: true })));
      await act(() => vi.advanceTimersByTimeAsync(2500));
      expect(harness.refresh).toHaveBeenCalledOnce();
      await act(() => vi.advanceTimersByTimeAsync(2500));
      expect(harness.refresh).toHaveBeenCalledOnce();
      harness.getState.mockResolvedValue({ ok: true, data: { ...workingState, pageCount: 7 } });
      await act(() => vi.advanceTimersByTimeAsync(2500));
      expect(harness.refresh).toHaveBeenCalledTimes(2);
    } finally {
      act(() => root.unmount());
    }
  });
  it("does not refresh the route when a poll returns the same state", async () => {
    harness.rootStore = { navigationGuard: new NavigationGuardController() };
    harness.getState.mockResolvedValue({ ok: true, data: workingState });
    const root = createRoot(document.createElement("div"));
    try {
      act(() => root.render(createElement(Poller, { working: true })));
      await act(() => vi.advanceTimersByTimeAsync(7500));
      expect(harness.getState).toHaveBeenCalledTimes(3);
      expect(harness.refresh).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  });

  it("survives a transient state-read failure and retries on the next tick", async () => {
    harness.rootStore = { navigationGuard: new NavigationGuardController() };
    harness.getState.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const root = createRoot(document.createElement("div"));
    try {
      act(() => root.render(createElement(Poller, { working: true })));
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(harness.getState).toHaveBeenCalledTimes(2);
      expect(harness.refresh).toHaveBeenCalledOnce();
      expect(harness.report).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  });

  it("reports unexpected failures once per outage and retries without clearing the state", async () => {
    harness.rootStore = { navigationGuard: new NavigationGuardController() };
    const error = new Error("state reader failed");
    harness.getState.mockRejectedValue(error);
    const root = createRoot(document.createElement("div"));
    try {
      act(() => root.render(createElement(Poller, { working: true })));
      await act(() => vi.advanceTimersByTimeAsync(7500));
      expect(harness.getState).toHaveBeenCalledTimes(3);
      expect(harness.report).toHaveBeenCalledExactlyOnceWith(error);
      harness.getState.mockResolvedValueOnce({ ok: true, data: workingState });
      await act(() => vi.advanceTimersByTimeAsync(5000));
      expect(harness.report).toHaveBeenCalledTimes(2);
      expect(harness.refresh).not.toHaveBeenCalled();
    } finally {
      act(() => root.unmount());
    }
  });

  it("ignores an unexpected rejection after the poller unmounts", async () => {
    harness.rootStore = { navigationGuard: new NavigationGuardController() };
    let reject!: (error: Error) => void;
    harness.getState.mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const root = createRoot(document.createElement("div"));
    act(() => root.render(createElement(Poller, { working: true })));
    await act(() => vi.advanceTimersByTimeAsync(2500));
    act(() => root.unmount());
    await act(async () => {
      reject(new Error("late error"));
      await Promise.resolve();
    });
    expect(harness.report).not.toHaveBeenCalled();
  });

  it.each(["unmount", "completed"] as const)("discards a queued refresh after %s", async (stop) => {
    const navigationGuard = new NavigationGuardController();
    harness.rootStore = { navigationGuard };
    const store = new WikiPageStore(
      harness.rootStore as unknown as RootStore,
      {
        id: "10000000-0000-4000-8000-000000000001",
        title: "Saved",
        markdown: "Body",
        kind: "knowledge",
        whenToUse: null,

        createdAt: new Date("2026-09-29"),
        updatedAt: new Date("2026-09-29"),
      },
      vi.fn(),
    );
    navigationGuard.register(store);
    store.onChange("title", "Unsaved title");
    const root = createRoot(document.createElement("div"));
    try {
      act(() => root.render(createElement(Poller, { working: true })));
      await act(() => vi.advanceTimersByTimeAsync(2500));
      expect(harness.refresh).not.toHaveBeenCalled();
      act(() => {
        if (stop === "unmount") root.unmount();
        else root.render(createElement(Poller, { working: false }));
      });
      store.resetDocument();
      expect(harness.refresh).not.toHaveBeenCalled();
    } finally {
      if (stop !== "unmount") act(() => root.unmount());
      navigationGuard.unregister(store);
    }
  });

  it("coalesces polls while the real page is dirty and resumes after reset", async () => {
    const navigationGuard = new NavigationGuardController();
    harness.rootStore = { navigationGuard };
    const store = new WikiPageStore(
      harness.rootStore as unknown as RootStore,
      {
        id: "10000000-0000-4000-8000-000000000001",
        title: "Saved",
        markdown: "Body",
        kind: "knowledge",
        whenToUse: null,

        createdAt: new Date("2026-09-29"),
        updatedAt: new Date("2026-09-29"),
      },
      vi.fn(),
    );
    navigationGuard.register(store);
    const root = createRoot(document.createElement("div"));
    try {
      act(() => root.render(createElement(Poller, { working: true })));
      await act(() => vi.advanceTimersByTimeAsync(2500));
      expect(harness.refresh).toHaveBeenCalledTimes(1);
      store.onChange("title", "Unsaved manual title");
      harness.getState.mockResolvedValue({
        ok: true,
        data: { ...workingState, pageCount: 2, progress: { fetched: 2, total: 2 } },
      });
      await act(() => vi.advanceTimersByTimeAsync(7500));
      expect(harness.refresh).toHaveBeenCalledTimes(1);
      expect(store.form.title).toBe("Unsaved manual title");
      store.resetDocument();
      expect(harness.refresh).toHaveBeenCalledTimes(2);
      act(() => root.render(createElement(Poller, { working: false })));
      await act(() => vi.advanceTimersByTime(5000));
      expect(harness.refresh).toHaveBeenCalledTimes(2);
    } finally {
      act(() => root.unmount());
      navigationGuard.unregister(store);
    }
  });
});
