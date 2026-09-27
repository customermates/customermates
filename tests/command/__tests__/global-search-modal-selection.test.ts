// @vitest-environment jsdom

import type { GlobalSearchResult, GlobalSearchResultItem } from "@/features/search/global-search.interactor";
import type { Root } from "react-dom/client";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { action, observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ globalSearchModalStore: null as unknown, openEntity: vi.fn() }));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ globalSearchModalStore: harness.globalSearchModalStore }),
}));
vi.mock("@/components/entity-detail/hooks/use-entity-drawer-stack", () => ({
  useOpenEntity: () => harness.openEntity,
}));
vi.mock("@/components/entity-terminology/use-entity-terminology", () => ({
  useEntityTerminology: () => ({ plural: (type: string) => type, singular: (type: string) => type }),
}));

import { GlobalSearchModal } from "@/app/components/global-search-modal";

const ALEXEJ: GlobalSearchResultItem = {
  type: "contact",
  id: "10000000-0000-4000-8000-000000000001",
  name: "Alexej Sofr",
  pictureUrl: null,
};
const AMIR: GlobalSearchResultItem = {
  type: "contact",
  id: "10000000-0000-4000-8000-000000000002",
  name: "Amir Haddad",
  pictureUrl: null,
};
const AMIN: GlobalSearchResultItem = {
  type: "contact",
  id: "10000000-0000-4000-8000-000000000003",
  name: "Amin Hassan",
  pictureUrl: null,
};
const TUI: GlobalSearchResultItem = {
  type: "organization",
  id: "20000000-0000-4000-8000-000000000001",
  name: "TUI",
  pictureUrl: null,
};

let container: HTMLDivElement;
let reactRoot: Root;

function searchStore(recentItems: GlobalSearchResultItem[]) {
  const store = observable(
    {
      isOpen: true,
      isLoading: false,
      debouncedSearchTerm: "",
      results: null as GlobalSearchResult | null,
      recentItems,
      form: { searchTerm: "" },
      focusReturnTarget: null,
      focusReturnFallback: null,
      clearRecentItems: vi.fn(),
      close: vi.fn(),
      pushRecentItem: vi.fn(),
      setWithUnsavedChangesGuard: vi.fn(),
      verifyRecentItem: vi.fn(() => Promise.resolve(true)),
      onChange(_key: string, value: string) {
        store.form.searchTerm = value;
      },
    },
    {
      clearRecentItems: false,
      close: false,
      onChange: action,
      pushRecentItem: false,
      setWithUnsavedChangesGuard: false,
      verifyRecentItem: false,
    },
  );
  return store;
}

function input() {
  const found = document.querySelector<HTMLInputElement>("[cmdk-input]");
  if (!found) throw new Error("Expected the search input");
  return found;
}

function selectedOption() {
  return document.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]');
}

async function settle(update: () => void) {
  await act(async () => {
    update();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function mutate(update: () => void) {
  return settle(() => runInAction(update));
}

function press(key: string) {
  act(() => {
    input().dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
  harness.openEntity.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  reactRoot = createRoot(container);
});

afterEach(() => {
  act(() => reactRoot.unmount());
  container.remove();
  document.body.replaceChildren();
  document.body.style.pointerEvents = "";
  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
  vi.unstubAllGlobals();
  harness.globalSearchModalStore = null;
});

describe("GlobalSearchModal highlighted hit", () => {
  async function openWith(recentItems: GlobalSearchResultItem[]) {
    const store = searchStore(recentItems);
    harness.globalSearchModalStore = store;
    await settle(() => reactRoot.render(createElement(GlobalSearchModal)));
    return store;
  }

  async function showResults(store: ReturnType<typeof searchStore>, term: string, results: GlobalSearchResultItem[]) {
    for (let length = 1; length <= term.length; length += 1)
      await settle(() => store.onChange("searchTerm", term.slice(0, length)));
    await mutate(() => {
      store.debouncedSearchTerm = term;
      store.isLoading = true;
    });
    await mutate(() => {
      store.results = { results };
      store.isLoading = false;
    });
  }

  function expectHighlighted(name: string) {
    const option = selectedOption();
    expect(option?.textContent).toContain(name);
    expect(input().getAttribute("aria-activedescendant")).toBe(option?.id);
  }

  it.each([
    ["one recent", [ALEXEJ]],
    ["two recents", [ALEXEJ, AMIR]],
  ])("highlights the first hit once typed results replace %s, and Enter opens it", async (_label, recents) => {
    const store = await openWith(recents);

    expectHighlighted("Alexej Sofr");

    await showResults(store, "Amin", [AMIN, TUI]);

    expectHighlighted("Amin Hassan");

    press("Enter");

    expect(store.pushRecentItem).toHaveBeenCalledWith(AMIN);
    expect(harness.openEntity).toHaveBeenCalledWith("contact", AMIN.id, null, null);
  });

  it("highlights the new first hit when a refined query drops the highlighted one", async () => {
    const store = await openWith([]);
    await showResults(store, "A", [AMIN, AMIR, TUI]);

    expectHighlighted("Amin Hassan");

    await showResults(store, "ATUI", [TUI]);

    expectHighlighted("TUI");
  });

  it("starts a reopened search on the first recent again", async () => {
    const store = await openWith([ALEXEJ, AMIR]);
    press("ArrowDown");

    expectHighlighted("Amir Haddad");

    await mutate(() => {
      store.isOpen = false;
    });
    await mutate(() => {
      store.isOpen = true;
    });

    expectHighlighted("Alexej Sofr");
  });

  it("still moves the highlight with the arrow keys", async () => {
    const store = await openWith([ALEXEJ]);
    await showResults(store, "Amin", [AMIN, TUI]);

    press("ArrowDown");

    expectHighlighted("TUI");

    press("ArrowUp");

    expectHighlighted("Amin Hassan");
  });
});
