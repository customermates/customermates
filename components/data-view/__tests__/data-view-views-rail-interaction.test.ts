import type { ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

type ConfirmationData = { message: string; onConfirm: () => Promise<boolean>; title: string };

const harness = vi.hoisted(() => ({
  appMode: { current: "cloud" as "cloud" | "demo" | "self-hosted" },
  calls: [] as string[],
  confirmations: [] as { entityName?: string; message: string; onConfirm: () => Promise<boolean>; title: string }[],
  deleteDataViewAction: vi.fn(),
  upsertDataViewAction: vi.fn(),
}));

vi.mock("mobx-react-lite", () => ({ observer: <T>(component: T) => component }));
vi.mock("next/navigation", () => ({ usePathname: () => "/en/deals" }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}(${Object.values(values).join(",")})` : key,
}));
vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({ appMode: harness.appMode.current }),
}));
vi.mock("@/app/components/topbar-actions-context", () => ({ useSetTopBarJoinedContent: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  deleteDataViewAction: (...args: unknown[]) => {
    harness.calls.push("deleteDataViewAction");
    return harness.deleteDataViewAction(...args);
  },
  upsertDataViewAction: (...args: unknown[]) => {
    harness.calls.push("upsertDataViewAction");
    return harness.upsertDataViewAction(...args);
  },
}));
vi.mock("@/components/modal/hooks/use-delete-confirmation", () => ({
  useDeleteConfirmation: () => ({
    showConfirmation: (data: ConfirmationData) => harness.confirmations.push(data),
    showDeleteConfirmation: (onConfirm: () => Promise<boolean>, entityName?: string) =>
      harness.confirmations.push({ entityName, message: "delete", onConfirm, title: "delete" }),
  }),
}));
vi.mock("@/components/modal/responsive-overlay", () => ({
  ResponsiveOverlay: ({
    children,
    footer,
    open,
    trigger,
    onOpenChange,
  }: {
    children: ReactNode;
    footer?: ReactNode;
    open: boolean;
    trigger: ReactNode;
    onOpenChange: (open: boolean) => void;
  }) =>
    createElement(
      "div",
      null,
      createElement("span", { onClick: () => onOpenChange(!open) }, trigger),
      open ? children : null,
      open ? footer : null,
    ),
}));
vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuCheckboxItem: ({ children, onSelect }: { children: ReactNode; onSelect: () => void }) =>
    createElement("button", { onClick: onSelect, type: "button" }, children),
  DropdownMenuContent: ({ children }: { children: ReactNode }) => createElement("div", null, children),
  DropdownMenuItem: ({
    children,
    disabled,
    onSelect,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onSelect: () => void;
  }) => createElement("button", { disabled, onClick: onSelect, type: "button" }, children),
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => children,
}));

import { DataViewViewsRail } from "../views/data-view-views-rail";

type Item = { id: string };

function view(overrides: Partial<DataViewChipDto> & { id: string }): DataViewChipDto {
  return {
    isOwner: true,
    name: `View ${overrides.id}`,
    position: 0,
    state: {},
    visibility: "private",
    ...overrides,
  };
}

const MINE = view({ id: "v-a", name: "Ada", position: 0 });
const SHARED_MINE = view({ id: "v-c", name: "Closing", position: 2, visibility: "workspace" });
const THEIRS = view({
  id: "v-b",
  isOwner: false,
  name: "Open deals",
  ownerName: "Sofia Rossi",
  position: 1,
  visibility: "workspace",
});
const VIEWS = [MINE, THEIRS, SHARED_MINE];

function store(overrides: Partial<BaseDataViewStore<Item>> = {}): BaseDataViewStore<Item> {
  return {
    activeViewKey: ALL_VIEW_KEY,
    applyView: vi.fn(() => harness.calls.push("applyView")),
    entityType: "DEAL",
    hasSelection: false,
    isDisabled: false,
    isReady: true,
    p13nId: "deals-card-store",
    pagination: { page: 1, pageSize: 25, total: 42 },
    refresh: vi.fn(() => {
      harness.calls.push("refresh");
      return Promise.resolve();
    }),
    resetView: vi.fn(() => Promise.resolve()),
    views: VIEWS,
    viewIsDirty: false,
    ...overrides,
  } as unknown as BaseDataViewStore<Item>;
}

let root: ReactRoot | undefined;
let container: HTMLDivElement | undefined;

function render(value: BaseDataViewStore<Item>): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      createElement(DataViewViewsRail<Item>, { store: value } as { store: BaseDataViewStore<Item> }) as ReactNode,
    );
  });
  return container;
}

function chips(host: HTMLElement): HTMLAnchorElement[] {
  return [...host.querySelectorAll<HTMLAnchorElement>("a[data-view-chip]")];
}

function byText(host: HTMLElement, text: string): HTMLButtonElement {
  const found = [...host.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.trim() === text,
  );
  if (!found) throw new Error(`no button labelled ${text}`);
  return found;
}

// eslint-disable-next-line @typescript-eslint/unbound-method -- the prototype setter must bypass React's value tracker so the controlled input sees the change
const setNativeInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set as
  | ((this: HTMLInputElement, value: string) => void)
  | undefined;

function press(target: HTMLElement, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key }));
  });
}

function swallowNavigation(event: Event): void {
  event.preventDefault();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.appMode.current = "cloud";
  harness.calls.length = 0;
  harness.confirmations.length = 0;
  harness.deleteDataViewAction.mockReset().mockResolvedValue({ data: { id: "v-a" }, ok: true });
  harness.upsertDataViewAction.mockReset().mockResolvedValue({ data: view({ id: "v-new", name: "Hot" }), ok: true });
  window.history.replaceState(null, "", "/en/deals");
  document.addEventListener("click", swallowNavigation);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  document.removeEventListener("click", swallowNavigation);
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("data view rail interaction", () => {
  it("moves focus across the chips with the arrow keys and keeps one tab stop", () => {
    const host = render(store({ activeViewKey: "v-a" }));
    const links = chips(host);

    expect(links).toHaveLength(4);
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);

    links[1].focus();
    press(links[1], "ArrowRight");
    expect(document.activeElement).toBe(links[2]);

    press(links[2], "ArrowLeft");
    expect(document.activeElement).toBe(links[1]);

    press(links[1], "End");
    expect(document.activeElement).toBe(links[3]);

    press(links[3], "Home");
    expect(document.activeElement).toBe(links[0]);

    press(links[0], "ArrowLeft");
    expect(document.activeElement).toBe(links[0]);
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
  });

  it("applies a view on a plain click and pushes the url afterwards, and defers to the browser otherwise", () => {
    const value = store();
    const host = render(value);
    const pushState = vi.spyOn(window.history, "pushState");
    const target = chips(host)[1];

    act(() => target.click());

    expect(value.applyView).toHaveBeenCalledExactlyOnceWith("v-a");
    expect(pushState).toHaveBeenCalledExactlyOnceWith(null, "", "/en/deals?view=v-a");
    expect(harness.calls).toEqual(["applyView"]);

    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    act(() => {
      target.dispatchEvent(modified);
    });

    expect(value.applyView).toHaveBeenCalledOnce();
    expect(pushState).toHaveBeenCalledOnce();
  });

  it("creates a view from the current query and then activates it", async () => {
    const value = store();
    const host = render(value);
    const pushState = vi.spyOn(window.history, "pushState");

    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-new")?.click());

    const input = host.querySelector<HTMLInputElement>("#view-editor-name");
    expect(input).not.toBeNull();

    act(() => {
      if (input) setNativeInputValue?.call(input, "Hot leads");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      host
        .querySelector<HTMLFormElement>("#view-editor-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ fromViewKey: ALL_VIEW_KEY, name: "Hot leads", visibility: "private" }),
    );
    expect(harness.calls).toEqual(["upsertDataViewAction", "refresh", "applyView"]);
    expect(value.applyView).toHaveBeenCalledExactlyOnceWith("v-new");
    expect(pushState).toHaveBeenCalledExactlyOnceWith(null, "", "/en/deals?view=v-new");
  });

  it("confirms before writing the current query into a shared view", async () => {
    const value = store({ activeViewKey: "v-c", viewIsDirty: true });
    const host = render(value);

    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-save")?.click());

    expect(harness.upsertDataViewAction).not.toHaveBeenCalled();
    expect(harness.confirmations).toHaveLength(1);
    expect(harness.confirmations[0].message).toBe("DataView.views.saveShared");

    await act(async () => {
      await harness.confirmations[0].onConfirm();
    });

    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ commitFromOverride: true, id: "v-c", visibility: "workspace" }),
    );
  });

  it("writes straight through when the dirty view is private", () => {
    const value = store({ activeViewKey: "v-a", viewIsDirty: true });
    const host = render(value);

    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-save")?.click());

    expect(harness.confirmations).toHaveLength(0);
    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ commitFromOverride: true, id: "v-a" }),
    );
  });

  it("confirms before taking a shared view private and writes straight through when sharing", async () => {
    const host = render(store({ activeViewKey: "v-c" }));

    act(() => byText(host, "DataView.views.shared").click());

    expect(harness.upsertDataViewAction).not.toHaveBeenCalled();
    expect(harness.confirmations).toHaveLength(1);
    expect(harness.confirmations[0].message).toBe("DataView.views.unshareWarning");

    await act(async () => {
      await harness.confirmations[0].onConfirm();
    });

    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "v-c", visibility: "private" }),
    );

    act(() => root?.unmount());
    harness.upsertDataViewAction.mockClear();
    harness.confirmations.length = 0;

    const privateHost = render(store({ activeViewKey: "v-a" }));
    act(() => byText(privateHost, "DataView.views.shared").click());

    expect(harness.confirmations).toHaveLength(0);
    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "v-a", visibility: "workspace" }),
    );
  });

  it("deletes through the shared confirmation, falls back to All and returns focus to it", async () => {
    const value = store({ activeViewKey: "v-a" });
    const host = render(value);

    act(() => byText(host, "DataView.views.delete").click());

    expect(harness.deleteDataViewAction).not.toHaveBeenCalled();
    expect(harness.confirmations).toHaveLength(1);
    expect(harness.confirmations[0].entityName).toBe("Ada");

    await act(async () => {
      expect(await harness.confirmations[0].onConfirm()).toBe(true);
    });

    expect(harness.deleteDataViewAction).toHaveBeenCalledExactlyOnceWith({ id: "v-a" });
    expect(value.applyView).toHaveBeenCalledExactlyOnceWith(ALL_VIEW_KEY);
    expect(value.refresh).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(host.querySelector("#global-data-views-all"));
  });

  it("reports a refused write as a failure instead of a success", async () => {
    harness.upsertDataViewAction.mockResolvedValue({ error: { errors: ["nope"] }, ok: false });

    const host = render(store({ activeViewKey: "v-c", viewIsDirty: true }));

    act(() => byText(host, "DataView.views.shared").click());
    expect(harness.confirmations).toHaveLength(1);
    await act(async () => {
      expect(await harness.confirmations[0].onConfirm()).toBe(false);
    });

    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-save")?.click());
    expect(harness.confirmations).toHaveLength(2);
    await act(async () => {
      expect(await harness.confirmations[1].onConfirm()).toBe(false);
    });
  });

  it("confirms before an edit takes a shared view private and leaves the overlay open on a refusal", async () => {
    const value = store({ activeViewKey: "v-c" });
    const host = render(value);

    act(() => byText(host, "DataView.views.editTitle").click());

    const share = host.querySelector<HTMLButtonElement>("#view-editor-share");
    expect(share?.getAttribute("aria-checked")).toBe("true");
    act(() => share?.click());

    await act(async () => {
      host
        .querySelector<HTMLFormElement>("#view-editor-form")
        ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(harness.upsertDataViewAction).not.toHaveBeenCalled();
    expect(harness.confirmations).toHaveLength(1);
    expect(harness.confirmations[0].message).toBe("DataView.views.unshareWarning");

    harness.upsertDataViewAction.mockResolvedValue({ error: { errors: ["nope"] }, ok: false });
    await act(async () => {
      expect(await harness.confirmations[0].onConfirm()).toBe(false);
    });

    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: "v-c", visibility: "private" }),
    );
    expect(value.refresh).not.toHaveBeenCalled();
    expect(host.querySelector("#view-editor-name")).not.toBeNull();
  });

  it("names every picker row menu after its own view and states sharing in text", () => {
    const host = render(store({ activeViewKey: "v-c" }));

    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-picker")?.click());

    const picker = host.querySelector<HTMLElement>("[data-data-view-picker]");
    const labels = [...(picker?.querySelectorAll("button[aria-label]") ?? [])].map((button) =>
      button.getAttribute("aria-label"),
    );

    expect(labels).toEqual([
      "DataView.views.menuFor(Ada)",
      "DataView.views.menuFor(Closing)",
      "DataView.views.menuFor(Open deals)",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
    expect(picker?.textContent).toContain("DataView.views.sharedState");
  });

  it("separates an empty workspace from a search that matches nothing", () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      view({ id: `v${index}`, name: `View ${index}`, position: index }),
    );
    const host = render(store({ views: many }));

    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-picker")?.click());

    const search = host.querySelector<HTMLInputElement>('input[placeholder="DataView.views.searchPlaceholder"]');
    expect(search).not.toBeNull();

    act(() => {
      if (search) setNativeInputValue?.call(search, "zzz");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const picker = host.querySelector<HTMLElement>("[data-data-view-picker]");
    expect(picker?.textContent).toContain("Common.inputs.emptyContent");
    expect(picker?.textContent).not.toContain("DataView.views.emptyHint");

    act(() => root?.unmount());

    const orphanHost = render(store({ activeViewKey: "gone", views: [] }));
    act(() => orphanHost.querySelector<HTMLButtonElement>("#global-data-views-picker")?.click());

    const orphanPicker = orphanHost.querySelector<HTMLElement>("[data-data-view-picker]");
    expect(orphanPicker?.textContent).toContain("DataView.views.emptyHint");
    expect(orphanPicker?.textContent).not.toContain("Common.inputs.emptyContent");
  });

  it("swaps positions with the neighbouring view you own when reordering", async () => {
    const value = store({ activeViewKey: "v-c" });
    const host = render(value);

    await act(async () => {
      byText(host, "DataView.views.moveLeft").click();
      await Promise.resolve();
    });

    expect(harness.upsertDataViewAction).toHaveBeenCalledTimes(2);
    expect(harness.upsertDataViewAction.mock.calls[0][0]).toMatchObject({ id: "v-c", position: 0 });
    expect(harness.upsertDataViewAction.mock.calls[1][0]).toMatchObject({ id: "v-a", position: 2 });
  });
});
