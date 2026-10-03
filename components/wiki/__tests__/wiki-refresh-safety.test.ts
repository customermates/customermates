import { act, createElement } from "react";
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

import { useRefreshWhileWikiSetupWorks } from "../wiki-homepage-setup";

const workingState = {
  status: "working" as const,
  homepage: "https://example.com/",
  domain: "example.com",
  conversationId: null,
  pages: [],
};

function Poller({ working }: { working: boolean }) {
  useRefreshWhileWikiSetupWorks(working ? workingState : { ...workingState, status: "completed" });
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  harness.getState.mockResolvedValue({ ok: true, data: { ...workingState, progress: { fetched: 1, total: 2 } } });
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Wiki polling safety", () => {
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
      harness.getState.mockResolvedValue({ ok: true, data: { ...workingState, progress: { fetched: 2, total: 2 } } });
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
