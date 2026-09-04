import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { Filter, FilterableField } from "@/core/base/base-get.schema";
import type { ReactElement, ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RootStore } from "@/core/stores/root.store";

import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";

import { FilterOperatorKey } from "@/core/base/base-query-builder";

const harness = vi.hoisted(() => ({
  palette: { current: null as unknown },
  selectItems: [] as { key: string; value: string; textValue: string }[],
}));

vi.mock("next-intl", () => ({
  useLocale: () => "en",
  useTranslations: () => (key: string, values?: { count?: number }) =>
    values?.count === undefined ? key : `${key}:${values.count}`,
}));

vi.mock("@/core/stores/root-store.provider", () => ({
  useRootStore: () => ({
    filterPaletteStore: harness.palette.current,
    intlStore: {
      formatNumber: () => "",
      formatNumberForEditing: () => "",
      formatNumericalShortDate: () => "",
      parseNumberToCanonical: (value: string) => value,
      use12Hour: false,
    },
    terminologyStore: { overrides: [] },
  }),
}));

vi.mock("@/components/forms/form-context", () => ({
  AppForm: ({ children }: { children: ReactNode }) => children,
  useAppForm: () => harness.palette.current,
}));

vi.mock("@/components/data-view/filter-modal/inputs/use-filter-select-items", () => ({
  useFilterSelectItems: () => ({
    getItems: undefined,
    isLoading: false,
    items: harness.selectItems,
    maxSelectedValues: undefined,
    retrySelection: vi.fn(),
    scopeKey: "static",
    selectionError: false,
  }),
}));

vi.mock("@/core/utils/use-debounced-value", () => ({
  useDebouncedValue: (value: string) => value,
}));

vi.mock("@/i18n/navigation", () => ({
  IntlLink: "a",
  getPathname: () => "/",
  redirect: vi.fn(),
  usePathname: () => "/",
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

import { FilterPalette } from "../filter-palette";
import { FilterPaletteStore } from "../filter-palette.store";
import { FilterPopover } from "@/components/data-view/header/filter-popover";

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: "name", operators: [FilterOperatorKey.contains, FilterOperatorKey.equals] },
  { field: "status", operators: [FilterOperatorKey.in, FilterOperatorKey.notIn] },
  { field: "email", operators: [FilterOperatorKey.contains] },
];

const roots: Root[] = [];
const containers: HTMLElement[] = [];

function tableStore(filters: Filter[] = []) {
  const table = {
    customColumns: [],
    filterableFields: FILTERABLE_FIELDS,
    filters,
    p13nId: "contacts",
    setQueryOptions: vi.fn((args: { filters?: Filter[] }) => {
      if (args.filters) table.filters = args.filters;
    }),
  };

  return table;
}

function newPalette() {
  const root = {
    registerModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user: { id: "user-1" }, canManage: () => true },
  };
  const palette = new FilterPaletteStore(root as unknown as RootStore);
  harness.palette.current = palette;

  return palette;
}

function openPalette(table: ReturnType<typeof tableStore>) {
  const palette = newPalette();
  palette.openFor(table as unknown as BaseDataViewStore<HasId>);

  return palette;
}

function mount(element: ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));

  return container;
}

function press(target: Element, key: string, init: KeyboardEventInit = {}) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init }));
  });
}

// eslint-disable-next-line @typescript-eslint/unbound-method -- the prototype setter must bypass React's value tracker so cmdk sees the change
const setNativeInputValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set as
  | ((this: HTMLInputElement, value: string) => void)
  | undefined;

function type(input: HTMLInputElement, value: string) {
  act(() => {
    setNativeInputValue?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function searchInput(container: HTMLElement) {
  return container.querySelector<HTMLInputElement>("[data-slot='command-input']") as HTMLInputElement;
}

function valueRows(container: HTMLElement) {
  return [...container.querySelectorAll("[data-palette-value]")];
}

function fieldRows(container: HTMLElement) {
  return [...container.querySelectorAll("[data-palette-field]")].map((row) => row.getAttribute("data-palette-field"));
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
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: true,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  harness.selectItems = [
    { key: "open", value: "open", textValue: "Open" },
    { key: "won", value: "won", textValue: "Won" },
  ];
});

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  for (const container of containers.splice(0)) container.remove();
  vi.unstubAllGlobals();
  harness.palette.current = null;
});

describe("filter palette keyboard", () => {
  it("narrows the field rows to what was typed", () => {
    const table = tableStore();
    openPalette(table);
    const container = mount(createElement(FilterPalette, { store: table as unknown as BaseDataViewStore<HasId> }));

    expect(fieldRows(container)).toEqual(["name", "status", "email"]);

    type(searchInput(container), "stat");

    expect(fieldRows(container)).toEqual(["status"]);
  });

  it("moves the highlight with the arrows and opens the highlighted field on Enter", () => {
    const table = tableStore();
    const palette = openPalette(table);
    const container = mount(createElement(FilterPalette, { store: table as unknown as BaseDataViewStore<HasId> }));

    press(searchInput(container), "ArrowDown");
    press(searchInput(container), "Enter");

    expect(palette.page).toEqual({ kind: "value", field: "status" });
  });

  it("pops one page on Backspace with an empty query and leaves a typed query alone", () => {
    const table = tableStore();
    const palette = openPalette(table);
    const container = mount(createElement(FilterPalette, { store: table as unknown as BaseDataViewStore<HasId> }));

    act(() => palette.pickField("status"));
    type(searchInput(container), "op");
    press(searchInput(container), "Backspace");

    expect(palette.page.kind).toBe("value");

    act(() => palette.setQuery(""));
    press(searchInput(container), "Backspace");

    expect(palette.page.kind).toBe("root");
  });

  it("toggles a select row on Enter once the arrows highlight it, and stays on the page", () => {
    const table = tableStore();
    const palette = openPalette(table);
    const container = mount(createElement(FilterPalette, { store: table as unknown as BaseDataViewStore<HasId> }));

    act(() => palette.pickField("status"));
    press(searchInput(container), "ArrowDown");

    const highlighted = valueRows(container).find((row) => row.getAttribute("aria-selected") === "true");
    expect(highlighted?.getAttribute("data-palette-value")).toBeTruthy();

    press(searchInput(container), "Enter");

    expect(palette.selectedValues).toEqual([highlighted?.getAttribute("data-palette-value")]);
    expect(palette.page.kind).toBe("value");
    expect(palette.isOpen).toBe(true);
    expect(container.querySelector("[data-palette-selected='true']")).not.toBeNull();
  });

  it("renders no command root on a text page, so Enter, Home and End reach the input", () => {
    const table = tableStore();
    const palette = openPalette(table);
    const container = mount(createElement(FilterPalette, { store: table as unknown as BaseDataViewStore<HasId> }));

    act(() => palette.pickField("name"));

    expect(container.querySelector("[cmdk-root]")).toBeNull();

    const input = container.querySelector<HTMLInputElement>("#draft\\.value") as HTMLInputElement;
    expect(input).not.toBeNull();

    press(input, "Enter");

    expect(palette.page.kind).toBe("root");
  });
});

describe("filter palette escape inside the real overlay", () => {
  function mountPopover(table: ReturnType<typeof tableStore>) {
    const palette = newPalette();
    const container = mount(
      createElement(FilterPopover, { id: "contacts-filter", store: table as unknown as BaseDataViewStore<HasId> }),
    );
    const trigger = container.querySelector<HTMLButtonElement>("#contacts-filter") as HTMLButtonElement;

    act(() => {
      trigger.focus();
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    return { container, palette, trigger };
  }

  function overlayContent() {
    return document.querySelector("[data-slot='popover-content']");
  }

  it("closes the overlay on Escape at the root page and returns focus to the toolbar trigger", async () => {
    const table = tableStore();
    const { palette, trigger } = mountPopover(table);

    expect(overlayContent()).not.toBeNull();

    const input = searchInput(overlayContent() as HTMLElement);
    act(() => input.focus());

    expect(document.activeElement).toBe(input);

    press(input, "Escape");

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(palette.isOpen).toBe(false);
    expect(overlayContent()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("pops one page on Escape below the root and leaves the overlay open", () => {
    const table = tableStore();
    const { palette } = mountPopover(table);

    act(() => palette.pickField("status"));

    expect(palette.page.kind).toBe("value");

    press(searchInput(overlayContent() as HTMLElement), "Escape");

    expect(palette.page.kind).toBe("root");
    expect(palette.isOpen).toBe(true);
    expect(overlayContent()).not.toBeNull();
  });
});
