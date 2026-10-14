import { recordSearchHit } from "@/tests/helpers/record-search";
// @vitest-environment jsdom

import type { RecordSearchResult, RecordSearchHit } from "@/features/records/record-search.schema";
import type { Root } from "react-dom/client";
import type { RecordNavigation } from "@/features/records/record-navigation.schema";
import type { CommandCatalog } from "@/features/command-palette/command-catalog.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { action, observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  globalSearchModalStore: null as unknown,
  openEntity: vi.fn(),
  mateEnabled: false,
  navigation: null as RecordNavigation | null,
  openWithDraft: vi.fn(),
  submitDraft: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/app/components/navigation/use-account-actions", () => ({
  useAccountActions: () => ({ changeTheme: vi.fn(), signOut: vi.fn(), inviteMembers: vi.fn(), sendFeedback: vi.fn() }),
}));
vi.mock("@/app/components/command-palette/record-command-level", () => ({ RecordCommandLevel: () => null }));
vi.mock("@/app/[locale]/(protected)/records/[typeId]/components/use-record-deletion", () => ({
  useRecordEditorDeletion: () => ({ requestDeletion: vi.fn() }),
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    appMode: "cloud",
    globalSearchModalStore: harness.globalSearchModalStore,
    recordWorkspaceStore: { open: harness.openEntity, activeEditor: null, navigation: harness.navigation },
    addPickerStore: { openFrom: vi.fn() },
    agentChatEnabled: harness.mateEnabled,
    agentChatStore: {
      enabled: harness.mateEnabled,
      open: vi.fn(),
      openWithDraft: harness.openWithDraft,
      submitDraft: harness.submitDraft,
    },
    companyInviteModalStore: { open: vi.fn(), generateInviteLink: vi.fn() },
    feedbackModalStore: { openFrom: vi.fn(), onInitOrRefresh: vi.fn() },
    keyboardShortcutsStore: { openFrom: vi.fn() },
    navigationGuard: { tryNavigate: (navigate: () => void) => navigate() },
    userStore: { can: () => true, updateTheme: vi.fn() },
    viewPickerStore: { surface: null },
  }),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: harness.push }), usePathname: () => "/dashboard" }));
import { GlobalSearchModal } from "@/app/components/global-search-modal";

const ALEXEJ = recordSearchHit("contact", "10000000-0000-4000-8000-000000000001", "Alexej Sofr");
const AMIR = recordSearchHit("contact", "10000000-0000-4000-8000-000000000002", "Amir Haddad");
const AMIN = recordSearchHit("contact", "10000000-0000-4000-8000-000000000003", "Amin Hassan");
const TUI = recordSearchHit("organization", "20000000-0000-4000-8000-000000000001", "TUI");

let container: HTMLDivElement;
let reactRoot: Root;

function searchStore(recentItems: RecordSearchHit[]) {
  const store = observable(
    {
      isOpen: true,
      isLoading: false,
      debouncedSearchTerm: "",
      results: null as RecordSearchResult | null,
      recentItems,
      recentCommandKeys: [] as string[],
      catalog: null as CommandCatalog | null,
      semantic: [] as { key: string; similarity: number }[],
      docs: [] as { key: string; title: string; section: string | null; href: string; similarity: number }[],
      level: null,
      form: { searchTerm: "" },
      focusReturnTarget: null,
      focusReturnFallback: null,
      clearRecentItems: vi.fn(),
      close: vi.fn(),
      pushRecentItem: vi.fn(),
      pushRecentCommand: vi.fn(),
      setInstantMatcher: vi.fn(),
      resolving: false,
      resolveNotice: null as "credits" | "service" | null,
      resolveCommand: vi.fn(),
      cancelResolve: vi.fn(),
      pushLevel: vi.fn(),
      popLevel: vi.fn(),
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
      pushRecentCommand: false,
      setInstantMatcher: false,
      resolveCommand: false,
      cancelResolve: false,
      pushLevel: false,
      popLevel: false,
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
  harness.openWithDraft.mockReset();
  harness.submitDraft.mockReset();
  harness.push.mockReset();
  harness.mateEnabled = false;
  harness.navigation = null;
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
  async function openWith(recentItems: RecordSearchHit[]) {
    const store = searchStore(recentItems);
    harness.globalSearchModalStore = store;
    await settle(() => reactRoot.render(createElement(GlobalSearchModal)));
    return store;
  }

  async function showResults(store: ReturnType<typeof searchStore>, term: string, results: RecordSearchHit[]) {
    for (let length = 1; length <= term.length; length += 1)
      await settle(() => store.onChange("searchTerm", term.slice(0, length)));
    await mutate(() => {
      store.debouncedSearchTerm = term;
      store.isLoading = true;
    });
    await mutate(() => {
      store.results = { results, schemaRevision: 1, nextCursor: null };
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
    expect(harness.openEntity).toHaveBeenCalledWith(AMIN.ref, null, null);
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

  it("keeps Ask Mate as the last fallback row and hands the typed question over with Tab", async () => {
    harness.mateEnabled = true;
    const store = await openWith([]);
    const options = () => [...document.querySelectorAll<HTMLElement>("[cmdk-item]")].map((item) => item.textContent);

    expect(options().at(-1)).toContain("AgentChat.askAi");

    await showResults(store, "who owns BMW", [TUI]);
    expect(options().at(-1)).toContain("GlobalSearch.askMateWith");
    expect(options().at(-2)).toContain("CommandPalette.resolve");
    expectHighlighted("TUI");

    press("Tab");

    expect(harness.openWithDraft).toHaveBeenCalledWith("who owns BMW");
    expect(harness.submitDraft).toHaveBeenCalledOnce();
    expect(store.close).toHaveBeenCalled();
  });

  it("shows a list with its views indented as the best match and opens a view with arrow down", async () => {
    const deals = "30000000-0000-4000-8000-000000000001";
    harness.navigation = {
      companyId: "30000000-0000-4000-8000-000000000009",
      schemaRevision: 1,
      canManageSchema: false,
      types: [{ id: deals, label: "Deal", pluralLabel: "Deals", icon: "handshake", canCreate: false, hasAuthorizationTasks: false }],
    };
    const store = await openWith([]);
    await mutate(() => {
      store.catalog = {
        schemaRevision: 1,
        views: [
          { typeId: deals, id: "view-open", name: "Open pipeline" },
          { typeId: deals, id: "view-won", name: "Won this quarter" },
        ],
        fields: [],
      };
    });
    await showResults(store, "deals", []);

    const best = document.querySelector('[cmdk-group-heading]');
    expect(best?.textContent).toBe("CommandPalette.groups.bestMatch");
    expectHighlighted("Deals");

    press("ArrowDown");
    expectHighlighted("Open pipeline");
    press("Enter");

    expect(harness.push).toHaveBeenCalledWith(`/records/${deals}?view=view-open&focus=view%3Aview-open`);
    expect(store.pushRecentCommand).toHaveBeenCalledWith("view:view-open");
  });

  it("does not reorder rows the person is arrowing through when records arrive late", async () => {
    harness.navigation = {
      companyId: "30000000-0000-4000-8000-000000000009",
      schemaRevision: 1,
      canManageSchema: false,
      types: [],
    };
    const store = await openWith([]);
    for (const length of [1, 2, 3, 4]) await settle(() => store.onChange("searchTerm", "dash".slice(0, length)));
    const before = [...document.querySelectorAll<HTMLElement>("[cmdk-item]")].map((item) => item.textContent);
    press("ArrowDown");
    const highlighted = selectedOption()?.textContent;

    await mutate(() => {
      store.debouncedSearchTerm = "dash";
      store.results = { results: [TUI], schemaRevision: 1, nextCursor: null };
    });

    const after = [...document.querySelectorAll<HTMLElement>("[cmdk-item]")].map((item) => item.textContent);
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toContain("TUI");
    expect(selectedOption()?.textContent).toBe(highlighted);
  });
  it("resolves an unmatched request on Enter to a filtered list and falls back to Ask Mate", async () => {
    harness.mateEnabled = true;
    const deals = "30000000-0000-4000-8000-000000000001";
    const store = await openWith([]);
    store.resolveCommand.mockResolvedValueOnce({
      status: "resolved",
      resolution: { kind: "list", typeId: deals, viewId: null, filters: [{ field: "stage", operator: "in", value: ["won"] }] },
    });
    await showResults(store, "won deals over 10k", []);
    expectHighlighted("CommandPalette.resolve");
    press("Enter");
    await settle(() => undefined);
    expect(store.resolveCommand).toHaveBeenCalledWith("won deals over 10k");
    expect(harness.push).toHaveBeenCalledWith(`/records/${deals}?filters=stage%3Ain%3Awon`);

    store.resolveCommand.mockResolvedValueOnce({ status: "none" });
    await showResults(store, "something nobody configured", []);
    press("Enter");
    await settle(() => undefined);
    expect(harness.openWithDraft).toHaveBeenCalledWith("something nobody configured");
    expect(harness.submitDraft).toHaveBeenCalled();
  });

  it("never calls the model on Enter while a result exists or the search is still running", async () => {
    harness.mateEnabled = true;
    const store = await openWith([]);
    for (const length of [1, 2, 3, 4, 5, 6, 7, 8, 9])
      await settle(() => store.onChange("searchTerm", "Anna Schm".slice(0, length)));
    expect(document.body.textContent).not.toContain("CommandPalette.resolve");
    await mutate(() => {
      store.debouncedSearchTerm = "Anna Schm";
      store.results = { results: [AMIN], schemaRevision: 1, nextCursor: null };
    });
    expectHighlighted("Amin Hassan");
    press("Enter");
    expect(harness.openEntity).toHaveBeenCalledWith(AMIN.ref, null, null);
    expect(store.resolveCommand).not.toHaveBeenCalled();
  });

  it("ignores a stale or unavailable resolution", async () => {
    harness.mateEnabled = true;
    const store = await openWith([]);
    store.resolveCommand.mockResolvedValueOnce({ status: "stale" });
    await showResults(store, "won deals over 10k", []);
    press("Enter");
    await settle(() => undefined);
    store.resolveCommand.mockResolvedValueOnce({ status: "unavailable" });
    press("Enter");
    await settle(() => undefined);
    expect(store.resolveCommand).toHaveBeenCalledTimes(2);
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.openWithDraft).not.toHaveBeenCalled();
  });

  it("shows one plain line when the resolver has no credits", async () => {
    harness.mateEnabled = true;
    const store = await openWith([]);
    await mutate(() => {
      store.resolveNotice = "credits";
    });
    expect(document.querySelector('[role="status"]')?.textContent).toBe("CommandPalette.resolveNoCredits");
  });
});
