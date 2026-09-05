import type { ReactNode } from "react";
import type { Root as ReactRoot } from "react-dom/client";
import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ALL_VIEW_KEY } from "@/core/data-view/data-view-keys";

const harness = vi.hoisted(() => ({
  appMode: { current: "cloud" as "cloud" | "demo" | "self-hosted" },
  calls: [] as string[],
  confirmations: [] as { entityName?: string; onConfirm: () => Promise<boolean> }[],
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
    showDeleteConfirmation: (onConfirm: () => Promise<boolean>, entityName?: string) =>
      harness.confirmations.push({ entityName, onConfirm }),
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
  DropdownMenuContent: ({ children }: { children: ReactNode }) =>
    createElement("div", { "data-view-menu": "" }, children),
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
    name: `View ${overrides.id}`,
    position: 0,
    state: {},
    ...overrides,
  };
}

const ADA = view({ id: "v-a", name: "Ada", position: 0 });
const OPEN = view({ id: "v-b", name: "Open deals", position: 1 });
const CLOSING = view({ id: "v-c", name: "Closing", position: 2, state: { hiddenColumns: ["email"] } });
const VIEWS = [ADA, OPEN, CLOSING];

function store(overrides: Partial<BaseDataViewStore<Item>> = {}): BaseDataViewStore<Item> {
  return {
    activeViewKey: ALL_VIEW_KEY,
    applyView: vi.fn(() => harness.calls.push("applyView")),
    discardPendingViewState: vi.fn(() => harness.calls.push("discardPendingViewState")),
    columnOrder: [],
    columnWidths: {},
    entityType: "DEAL",
    filters: [],
    grouping: null,
    hasSelection: false,
    hiddenColumns: [],
    isDisabled: false,
    isReady: true,
    p13nId: "deals-card-store",
    pagination: { page: 1, pageSize: 25, total: 42 },
    refresh: vi.fn(() => {
      harness.calls.push("refresh");
      return Promise.resolve();
    }),
    searchTerm: "",
    sortDescriptor: undefined,
    viewMode: "table",
    views: VIEWS,
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

function menuLabels(host: HTMLElement): string[] {
  return [...host.querySelectorAll<HTMLButtonElement>("[data-view-menu] button")].map(
    (button) => button.textContent?.trim() ?? "",
  );
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

function typeInto(input: HTMLInputElement | null, value: string): void {
  act(() => {
    if (input) setNativeInputValue?.call(input, value);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitMetaForm(host: HTMLElement): Promise<void> {
  await act(async () => {
    host
      .querySelector<HTMLFormElement>("#view-editor-form")
      ?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

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
  it("moves focus across the tabs with the arrow keys and keeps one tab stop", () => {
    const host = render(store({ activeViewKey: "v-a" }));
    const links = chips(host);

    expect(links).toHaveLength(4);
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(links[1].getAttribute("tabindex")).toBe("0");

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

  it("shows a draft tab while creating, then saves the current query as a view and activates it", async () => {
    const value = store({ filters: [{ field: "stage", operator: "in", value: ["open"] }] } as unknown as Partial<
      BaseDataViewStore<Item>
    >);
    const host = render(value);
    const pushState = vi.spyOn(window.history, "pushState");

    expect(host.querySelector("[data-view-draft]")).toBeNull();

    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-new")?.click());

    const draft = host.querySelector<HTMLElement>("[data-view-draft]");
    expect(draft?.textContent).toBe("DataView.views.createTitle");
    expect(draft?.className).toContain("border-dashed");
    expect(draft?.className).toContain("border-input");
    expect(draft?.className).not.toContain("border-border");
    expect(chips(host)).toHaveLength(4);

    const input = host.querySelector<HTMLInputElement>("#view-editor-name");
    expect(input).not.toBeNull();
    typeInto(input, "Hot leads");
    expect(host.querySelector("[data-view-draft]")?.textContent).toBe("DataView.views.createTitle");

    await submitMetaForm(host);

    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith({
      name: "Hot leads",
      state: {
        columnOrder: [],
        columnWidths: {},
        filters: [{ field: "stage", operator: "in", value: ["open"] }],
        grouping: null,
        hiddenColumns: [],
        pageSize: 25,
        searchTerm: "",
        sortDescriptor: null,
        viewMode: "table",
      },
      surfaceKey: "deals-card-store",
    });
    expect(harness.calls).toEqual(["upsertDataViewAction", "refresh", "applyView"]);
    expect(value.applyView).toHaveBeenCalledExactlyOnceWith("v-new");
    expect(pushState).toHaveBeenCalledExactlyOnceWith(null, "", "/en/deals?view=v-new");
    expect(host.querySelector("[data-view-draft]")).toBeNull();
  });

  it("keeps the create overlay open when the write is refused", async () => {
    harness.upsertDataViewAction.mockResolvedValue({ error: { errors: ["nope"] }, ok: false });
    const value = store();
    const host = render(value);

    act(() => host.querySelector<HTMLButtonElement>("#global-data-views-new")?.click());
    typeInto(host.querySelector<HTMLInputElement>("#view-editor-name"), "Hot leads");
    await submitMetaForm(host);

    expect(harness.upsertDataViewAction).toHaveBeenCalledOnce();
    expect(value.applyView).not.toHaveBeenCalled();
    expect(host.querySelector("#view-editor-name")).not.toBeNull();
    expect(host.querySelector("[data-view-draft]")).not.toBeNull();
  });

  it("offers edit, duplicate, move, copy link and delete on the active view, in that order", () => {
    const host = render(store({ activeViewKey: "v-b" }));

    expect(menuLabels(host)).toEqual([
      "DataView.views.editTitle",
      "DataView.views.duplicate",
      "DataView.views.moveLeft",
      "DataView.views.moveRight",
      "DataView.views.copyLink",
      "DataView.views.delete",
    ]);
    expect(host.querySelector("[data-view-menu]")?.textContent).not.toContain("Common.actions.save");
  });

  it("renames the active view through the edit overlay with the store's live state", async () => {
    const value = store({ activeViewKey: "v-c" });
    const host = render(value);

    act(() => byText(host, "DataView.views.editTitle").click());

    const input = host.querySelector<HTMLInputElement>("#view-editor-name");
    expect(input?.value).toBe("Closing");
    expect(host.querySelector("[data-view-draft]")).toBeNull();

    typeInto(input, "Closed");
    await submitMetaForm(host);

    expect(harness.upsertDataViewAction).toHaveBeenCalledExactlyOnceWith({
      id: "v-c",
      name: "Closed",
      position: undefined,
      state: {
        columnOrder: [],
        columnWidths: {},
        filters: [],
        grouping: null,
        hiddenColumns: [],
        pageSize: 25,
        searchTerm: "",
        sortDescriptor: null,
        viewMode: "table",
      },
      surfaceKey: "deals-card-store",
    });
    expect(harness.calls).toEqual(["upsertDataViewAction", "refresh"]);
    expect(host.querySelector("#view-editor-name")).toBeNull();
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

  it("swaps positions with the neighbouring view when reordering", async () => {
    const value = store({ activeViewKey: "v-c" });
    const host = render(value);

    await act(async () => {
      byText(host, "DataView.views.moveLeft").click();
      await Promise.resolve();
    });

    expect(harness.upsertDataViewAction).toHaveBeenCalledTimes(2);
    expect(harness.upsertDataViewAction.mock.calls[0][0]).toMatchObject({ id: "v-c", position: 1 });
    expect(harness.upsertDataViewAction.mock.calls[1][0]).toMatchObject({ id: "v-b", position: 2 });
    expect(byText(host, "DataView.views.moveRight").disabled).toBe(true);
  });
});
