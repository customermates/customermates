import type { Root } from "react-dom/client";
import type { ReactNode } from "react";

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { OverflowRail } from "../overflow-rail";

const observed: Element[] = [];
const disconnects = { count: 0 };

class ResizeObserverMock {
  observe(element: Element) {
    observed.push(element);
  }
  disconnect() {
    disconnects.count += 1;
  }
  unobserve() {}
}

let container: HTMLDivElement;
let root: Root;

type RailProps = {
  ariaLabel: string;
  bleed?: boolean;
  children: ReactNode;
  className?: string;
  focusable?: boolean;
  observedKey?: unknown;
  overflowAttribute?: string;
  railClassName?: string;
  railProps?: Record<string, string>;
  regionProps?: Record<string, string>;
};

function render(props: Partial<RailProps> = {}) {
  act(() => {
    root.render(
      createElement(OverflowRail, {
        ariaLabel: "Overview",
        children: createElement("span", { "data-cell": "one" }, "one"),
        regionProps: { "data-scroll-region": "" },
        ...props,
      } as RailProps),
    );
  });

  const region = container.querySelector<HTMLElement>("[data-scroll-region]");
  if (!region) throw new Error("Expected the overflow rail scroll region");
  return region;
}

function overflow(region: HTMLElement, { clientWidth, scrollWidth }: { clientWidth: number; scrollWidth: number }) {
  Object.defineProperty(region, "clientWidth", { configurable: true, value: clientWidth });
  Object.defineProperty(region, "scrollWidth", { configurable: true, value: scrollWidth });
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverMock);
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  observed.length = 0;
  disconnects.count = 0;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("OverflowRail", () => {
  it("becomes a labelled keyboard region only while it overflows", () => {
    const region = render();

    expect(region.getAttribute("role")).toBeNull();
    expect(region.getAttribute("tabindex")).toBeNull();
    expect(region.getAttribute("aria-label")).toBeNull();
    expect(region.getAttribute("data-overflow-rail-overflow")).toBeNull();

    overflow(region, { clientWidth: 240, scrollWidth: 480 });

    expect(region.getAttribute("role")).toBe("region");
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.getAttribute("aria-label")).toBe("Overview");
    expect(region.getAttribute("data-overflow-rail-overflow")).toBe("true");

    overflow(region, { clientWidth: 240, scrollWidth: 240 });

    expect(region.getAttribute("role")).toBeNull();
    expect(region.getAttribute("tabindex")).toBeNull();
    expect(region.getAttribute("aria-label")).toBeNull();
    expect(region.getAttribute("data-overflow-rail-overflow")).toBeNull();
  });

  it("never adds a region tab stop when the children carry the focus", () => {
    const region = render({ focusable: false });

    overflow(region, { clientWidth: 240, scrollWidth: 480 });

    expect(region.getAttribute("role")).toBeNull();
    expect(region.getAttribute("tabindex")).toBeNull();
    expect(region.getAttribute("aria-label")).toBeNull();
    expect(region.getAttribute("data-overflow-rail-overflow")).toBe("true");
  });

  it("renames the emitted overflow attribute", () => {
    const region = render({ overflowAttribute: "data-summary-overflow" });

    overflow(region, { clientWidth: 240, scrollWidth: 480 });

    expect(region.getAttribute("data-summary-overflow")).toBe("true");
    expect(region.getAttribute("data-overflow-rail-overflow")).toBeNull();
  });

  it("passes the region and rail hooks through verbatim", () => {
    const region = render({
      className: "min-w-0 flex-1",
      railClassName: "items-center gap-1.5 py-2.5",
      railProps: { "aria-orientation": "horizontal", "data-data-view-rail-items": "", role: "toolbar" },
      regionProps: { "data-scroll-region": "", "data-rail-owner": "views" },
    });
    const rail = region.querySelector<HTMLElement>("[data-data-view-rail-items]");

    expect(region.getAttribute("data-rail-owner")).toBe("views");
    expect(region.className).toContain("min-w-0");
    expect(region.className).toContain("flex-1");
    expect(region.className).toContain("focus-visible:ring-[3px]");
    expect(region.className).toContain("focus-visible:ring-inset");
    expect(rail).not.toBeNull();
    expect(rail?.getAttribute("role")).toBe("toolbar");
    expect(rail?.getAttribute("aria-orientation")).toBe("horizontal");
    expect(rail?.className).toContain("flex");
    expect(rail?.className).toContain("w-max");
    expect(rail?.className).toContain("min-w-full");
    expect(rail?.className).toContain("items-center");
    expect(rail?.className).toContain("gap-1.5");
    expect(rail?.querySelector('[data-cell="one"]')).not.toBeNull();
  });

  it("bleeds into the surrounding padding by default and drops it on request", () => {
    const bleeding = render();

    expect(bleeding.classList.contains("-mx-4")).toBe(true);
    expect(bleeding.classList.contains("px-4")).toBe(true);

    const flush = render({ bleed: false });

    expect(flush.classList.contains("-mx-4")).toBe(false);
    expect(flush.classList.contains("px-4")).toBe(false);
  });

  it("observes the region and its first element child, then releases both on unmount", () => {
    const localContainer = document.createElement("div");
    document.body.append(localContainer);
    const localRoot = createRoot(localContainer);
    act(() => {
      localRoot.render(
        createElement(OverflowRail, {
          ariaLabel: "Overview",
          children: createElement("span", { "data-cell": "one" }, "one"),
          regionProps: { "data-scroll-region": "" },
        } as RailProps),
      );
    });
    const region = localContainer.querySelector<HTMLElement>("[data-scroll-region]");
    if (!region) throw new Error("Expected the overflow rail scroll region");

    expect(observed).toHaveLength(2);
    expect(observed[0]).toBe(region);
    expect(observed[1]).toBe(region.firstElementChild);

    const listeners = vi.spyOn(window, "removeEventListener");
    act(() => localRoot.unmount());
    localContainer.remove();

    expect(disconnects.count).toBe(1);
    expect(listeners).toHaveBeenCalledWith("resize", expect.any(Function));
    listeners.mockRestore();
  });
});
