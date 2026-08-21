import type { Root } from "react-dom/client";
import type { BaseDataViewStore, HasId } from "@/core/base/base-data-view.store";
import type { GetResult } from "@/core/base/base-get.interactor";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../data-view-url-sync", () => ({
  connectDataViewUrlSync: () => () => {},
}));

import { useDataViewSync } from "../use-data-view-sync";

const roots: Root[] = [];

function createStore({ isReady = false }: { isReady?: boolean } = {}) {
  const setItems = vi.fn();
  const store = {
    isReady,
    setItems,
    refresh: vi.fn(),
    registerOnChange: vi.fn(() => () => {}),
  } as unknown as BaseDataViewStore<HasId>;
  return { setItems, store };
}

function createResult(id: string): GetResult<HasId> {
  return { items: [{ id }] } as unknown as GetResult<HasId>;
}

function Harness({ initial, store }: { initial: GetResult<HasId>; store: BaseDataViewStore<HasId> }) {
  useDataViewSync(store, initial);
  return null;
}

function mount(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return root;
}

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  document.body.replaceChildren();
});

describe("useDataViewSync", () => {
  it("applies the server result during render, so a server-rendered page never needs an effect to leave its loading state", () => {
    const { setItems, store } = createStore();
    const initial = createResult("a");

    function SeedProbe() {
      useDataViewSync(store, initial);
      return createElement("div", { "data-seeded": String(setItems.mock.calls.length > 0) });
    }

    const html = renderToStaticMarkup(createElement(SeedProbe));

    expect(html).toContain('data-seeded="true"');
    expect(setItems).toHaveBeenCalledExactlyOnceWith(initial);
  });

  it("does not seed during render when the shared store is already populated, so a remount never updates its live observers mid-render", () => {
    const { setItems, store } = createStore({ isReady: true });
    const initial = createResult("a");

    function SeedProbe() {
      useDataViewSync(store, initial);
      return createElement("div", { "data-seeded": String(setItems.mock.calls.length > 0) });
    }

    const html = renderToStaticMarkup(createElement(SeedProbe));

    expect(html).toContain('data-seeded="false"');
    expect(setItems).not.toHaveBeenCalled();
  });

  it("still applies the server result from the effect when the store was already populated", () => {
    const { setItems, store } = createStore({ isReady: true });
    const initial = createResult("a");

    mount(createElement(Harness, { initial, store }));

    expect(setItems).toHaveBeenCalledExactlyOnceWith(initial);
  });

  it("does not re-apply an unchanged server result on re-render", () => {
    const { setItems, store } = createStore();
    const initial = createResult("a");

    const root = mount(createElement(Harness, { initial, store }));
    act(() => root.render(createElement(Harness, { initial, store })));

    expect(setItems).toHaveBeenCalledExactlyOnceWith(initial);
  });

  it("applies a new server result when its identity changes", () => {
    const { setItems, store } = createStore();
    const first = createResult("a");
    const second = createResult("b");

    const root = mount(createElement(Harness, { initial: first, store }));
    act(() => root.render(createElement(Harness, { initial: second, store })));

    expect(setItems).toHaveBeenCalledTimes(2);
    expect(setItems).toHaveBeenNthCalledWith(1, first);
    expect(setItems).toHaveBeenNthCalledWith(2, second);
  });
});
