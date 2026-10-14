import { recordInvariant } from "@/features/records/record-invariant";
import { act, createElement, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { observable, runInAction } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Filter } from "@/core/base/base-get.schema";
import type { FilterTarget } from "../filter-target";
import type { FilterPaletteStore } from "../filter-palette.store";
import { FilterOperatorKey as Op } from "@/core/base/base-query-builder";
const harness = vi.hoisted(() => ({
  root: {
    registerModalStore: vi.fn(),
    unregisterModalStore: vi.fn(),
    localeStore: { getTranslation: (key: string) => key },
  },
}));
vi.mock("@/core/stores/root-store.provider", () => ({ useRootStore: () => harness.root }));
import { useFilterPalette } from "../use-filter-palette";
let mounted: Root | undefined;
let node: HTMLDivElement;
const palettes = new Map<string, FilterPaletteStore>();
function Host({ target, name }: { target: FilterTarget; name: string }) {
  palettes.set(name, useFilterPalette(target));
  return null;
}
function fixture(discard = true) {
  const state = observable({ filters: [] as Filter[], identity: {}, disabled: false, scope: "first" });
  const target: FilterTarget = {
    discardPendingOnDispose: discard,
    get identity() {
      return state.identity;
    },
    get isDisabled() {
      return state.disabled;
    },
    get scopeKey() {
      return state.scope;
    },
    filterableFields: [{ field: "name", operators: [Op.contains] }],
    get filters() {
      return state.filters;
    },
    setQueryOptions: vi.fn(({ filters }) =>
      runInAction(() => {
        state.filters = filters;
      }),
    ),
    removeFilterAt: vi.fn(),
  };
  return { target, state };
}
beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  harness.root.registerModalStore.mockClear();
  harness.root.unregisterModalStore.mockClear();
  palettes.clear();
  node = document.createElement("div");
  document.body.append(node);
  mounted = createRoot(node);
});
afterEach(() => {
  if (mounted) act(() => mounted?.unmount());
  mounted = undefined;
  node.remove();
  vi.useRealTimers();
});
function edit(name: string, target: FilterTarget) {
  const palette = recordInvariant(palettes.get(name));
  act(() => {
    palette.openFor(target);
    palette.pickField("name");
    palette.onChange("draft.value", name);
  });
  return palette;
}
describe("host-owned palette lifecycle", () => {
  it("keeps concurrent source and group hosts independent and balances StrictMode registration", () => {
    const source = fixture();
    const group = fixture();
    act(() =>
      recordInvariant(mounted).render(
        createElement(
          StrictMode,
          {},
          createElement(Host, { name: "source", target: source.target }),
          createElement(Host, { name: "group", target: group.target }),
        ),
      ),
    );
    expect(palettes.get("source")).not.toBe(palettes.get("group"));
    edit("source", source.target);
    edit("group", group.target);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(source.state.filters).toEqual([{ field: "name", operator: Op.contains, value: "source" }]);
    expect(group.state.filters).toEqual([{ field: "name", operator: Op.contains, value: "group" }]);
    act(() => recordInvariant(mounted).unmount());
    mounted = undefined;
    expect(harness.root.registerModalStore.mock.calls.length).toBe(harness.root.unregisterModalStore.mock.calls.length);
  });
  it.each(["identity", "scope", "disabled"] as const)(
    "cancels stale pending edits when the host %s changes",
    (change) => {
      const f = fixture();
      act(() => recordInvariant(mounted).render(createElement(Host, { name: "widget", target: f.target })));
      const palette = edit("widget", f.target);
      act(() =>
        runInAction(() => {
          if (change === "identity") f.state.identity = {};
          else if (change === "scope") f.state.scope = "next";
          else f.state.disabled = true;
        }),
      );
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(f.target.setQueryOptions).not.toHaveBeenCalled();
      expect(palette.isOpen).toBe(false);
      expect(palette.target).toBeUndefined();
    },
  );
  it("discards a form draft on unmount but preserves the established data-view flush", () => {
    const form = fixture();
    const table = fixture(false);
    act(() =>
      recordInvariant(mounted).render(
        createElement(
          StrictMode,
          {},
          createElement(Host, { name: "form", target: form.target }),
          createElement(Host, { name: "table", target: table.target }),
        ),
      ),
    );
    edit("form", form.target);
    edit("table", table.target);
    act(() => recordInvariant(mounted).unmount());
    mounted = undefined;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(form.target.setQueryOptions).not.toHaveBeenCalled();
    expect(table.target.setQueryOptions).toHaveBeenCalledTimes(1);
  });
});
