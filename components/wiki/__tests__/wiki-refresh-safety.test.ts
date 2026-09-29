import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NavigationGuardController } from "@/core/stores/navigation-guard.controller";
import type { RootStore } from "@/core/stores/root.store";
import { WikiPageStore } from "@/app/[locale]/(protected)/wiki/components/wiki-page.store";

const harness = vi.hoisted(() => ({ refresh: vi.fn(), rootStore: {} as Record<string, unknown> }));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ refresh: harness.refresh }) }));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.rootStore }));
vi.mock("@/app/[locale]/(protected)/wiki/actions", () => ({
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

function Poller({ working }: { working: boolean }) {
  useRefreshWhileWikiSetupWorks(working);
  return null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("Wiki polling safety", () => {
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
      await act(() => vi.advanceTimersByTime(2500));
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
      await act(() => vi.advanceTimersByTime(2500));
      expect(harness.refresh).toHaveBeenCalledTimes(1);
      store.onChange("title", "Unsaved manual title");
      await act(() => vi.advanceTimersByTime(7500));
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
